// src/pages/_app.tsx
import { ColorScheme, ColorSchemeProvider, MantineProvider } from '@mantine/core';
import { NotificationsProvider } from '@mantine/notifications';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { getCookie, getCookies, setCookie } from 'cookies-next';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import isBetween from 'dayjs/plugin/isBetween';
import minMax from 'dayjs/plugin/minMax';
import relativeTime from 'dayjs/plugin/relativeTime';
import type { NextPage } from 'next';
import type { AppContext, AppProps } from 'next/app';
import App from 'next/app';
import Head from 'next/head';
import type { Session } from 'next-auth';
import { getSession } from 'next-auth/react';
import React, { ReactElement, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

import { AppLayout } from '~/components/AppLayout/AppLayout';
import { trpc } from '~/utils/trpc';
import '~/styles/globals.css';
import { CustomModalsProvider } from './../providers/CustomModalsProvider';
import { TosProvider } from '~/providers/TosProvider';
import { CookiesContext, CookiesProvider, parseCookies } from '~/providers/CookiesProvider';
import { MaintenanceMode } from '~/components/MaintenanceMode/MaintenanceMode';
// import { ImageProcessingProvider } from '~/components/ImageProcessing';
import { FeatureFlagsProvider } from '~/providers/FeatureFlagsProvider';
import { getFeatureFlags } from '~/server/services/feature-flags.service';
import type { FeatureFlags } from '~/server/services/feature-flags.service';
import { ClientHistoryStore } from '~/store/ClientHistoryStore';
import { FreezeProvider, RoutedContextProvider2 } from '~/providers/RoutedContextProvider';
import { isDev, isMaintenanceMode } from '~/env/other';
import { RegisterCatchNavigation } from '~/store/catch-navigation.store';
import { CivitaiLinkProvider } from '~/components/CivitaiLink/CivitaiLinkProvider';
import { MetaPWA } from '~/components/Meta/MetaPWA';
import {
  FiltersProviderOld,
  FiltersInput,
  parseFiltersCookieOld,
} from '~/providers/FiltersProviderOld';
import PlausibleProvider from 'next-plausible';
import { CivitaiSessionProvider } from '~/components/CivitaiWrapped/CivitaiSessionProvider';
import { CookiesState, FiltersProvider, parseFilterCookies } from '~/providers/FiltersProvider';
import { RouterTransition } from '~/components/RouterTransition/RouterTransition';

dayjs.extend(duration);
dayjs.extend(isBetween);
dayjs.extend(minMax);
dayjs.extend(relativeTime);

type CustomNextPage = NextPage & {
  getLayout?: (page: ReactElement) => ReactNode;
};

type CustomAppProps = {
  Component: CustomNextPage;
} & AppProps<{
  session: Session | null;
  colorScheme: ColorScheme;
  cookies: CookiesContext;
  filtersOld: FiltersInput;
  filters: CookiesState;
  flags: FeatureFlags;
  isMaintenanceMode: boolean | undefined;
}>;

function MyApp(props: CustomAppProps) {
  const {
    Component,
    pageProps: {
      session,
      colorScheme: initialColorScheme,
      cookies,
      filtersOld,
      filters,
      flags,
      isMaintenanceMode,
      ...pageProps
    },
  } = props;
  const [colorScheme, setColorScheme] = useState<ColorScheme | undefined>(initialColorScheme);
  const toggleColorScheme = useCallback(
    (value?: ColorScheme) => {
      const nextColorScheme = value || (colorScheme === 'dark' ? 'light' : 'dark');
      setColorScheme(nextColorScheme);
      setCookie('mantine-color-scheme', nextColorScheme, {
        expires: dayjs().add(1, 'year').toDate(),
      });
    },
    [colorScheme]
  );

  useEffect(() => {
    if (colorScheme === undefined && typeof window !== 'undefined') {
      const osColor = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
      setColorScheme(osColor);
    }
  }, [colorScheme]);

  const getLayout = useMemo(
    () => Component.getLayout ?? ((page: React.ReactElement) => <AppLayout>{page}</AppLayout>),
    [Component.getLayout]
  );

  const content = isMaintenanceMode ? (
    <MaintenanceMode />
  ) : (
    <>
      <ClientHistoryStore />
      <RegisterCatchNavigation />
      <RouterTransition />
      <CivitaiSessionProvider session={session}>
        <CookiesProvider value={cookies}>
          <FiltersProviderOld value={filtersOld}>
            <FiltersProvider value={filters}>
              <FeatureFlagsProvider flags={flags}>
                <CivitaiLinkProvider>
                  <CustomModalsProvider>
                    <NotificationsProvider>
                      <FreezeProvider>
                        <TosProvider>{getLayout(<Component {...pageProps} />)}</TosProvider>
                      </FreezeProvider>
                      <RoutedContextProvider2 />
                    </NotificationsProvider>
                  </CustomModalsProvider>
                </CivitaiLinkProvider>
              </FeatureFlagsProvider>
            </FiltersProvider>
          </FiltersProviderOld>
        </CookiesProvider>
      </CivitaiSessionProvider>
    </>
  );

  return (
    <>
      <Head>
        <title>Civitai | Share your models</title>
        <MetaPWA />
      </Head>

      <ColorSchemeProvider
        colorScheme={colorScheme ?? 'dark'}
        toggleColorScheme={toggleColorScheme}
      >
        <MantineProvider
          theme={{
            colorScheme,
            components: {
              Modal: { styles: { modal: { maxWidth: '100%' } } },
              Popover: { styles: { dropdown: { maxWidth: '100vw' } } },
              Rating: { styles: { symbolBody: { cursor: 'pointer' } } },
              Switch: {
                styles: {
                  body: { verticalAlign: 'top' },
                  track: { cursor: 'pointer' },
                  label: { cursor: 'pointer' },
                },
              },
              Radio: {
                styles: {
                  radio: { cursor: 'pointer' },
                  label: { cursor: 'pointer' },
                },
              },
              Badge: {
                styles: { leftSection: { lineHeight: 1 } },
                defaultProps: { radius: 'sm' },
              },
              Checkbox: {
                styles: {
                  input: { cursor: 'pointer' },
                  label: { cursor: 'pointer' },
                },
              },
            },
          }}
          withGlobalStyles
          withNormalizeCSS
        >
          <PlausibleProvider
            domain="civitai.com"
            customDomain="https://analytics.civitai.com"
            selfHosted
          >
            {content}
          </PlausibleProvider>
        </MantineProvider>
      </ColorSchemeProvider>
      {isDev && <ReactQueryDevtools />}
    </>
  );
}

MyApp.getInitialProps = async (appContext: AppContext) => {
  const initialProps = await App.getInitialProps(appContext);
  const url = appContext.ctx?.req?.url;
  const isClient = !url || url?.startsWith('/_next/data');

  const { pageProps, ...appProps } = initialProps;
  const colorScheme = getCookie('mantine-color-scheme', appContext.ctx) ?? 'dark';
  const cookies = getCookies(appContext.ctx);
  const parsedCookies = parseCookies(cookies);
  const filtersOld = parseFiltersCookieOld(cookies);
  const filters = parseFilterCookies(cookies);

  if (isMaintenanceMode) {
    return {
      pageProps: {
        ...pageProps,
        colorScheme,
        cookies: parsedCookies,
        isMaintenanceMode,
        filtersOld,
        filters,
      },
      ...appProps,
    };
  } else {
    const hasAuthCookie =
      !isClient && Object.keys(cookies).some((x) => x.endsWith('civitai-token'));
    const session = hasAuthCookie ? await getSession(appContext.ctx) : undefined;
    const flags = getFeatureFlags({ user: session?.user });
    // Pass this via the request so we can use it in SSR
    if (session) {
      (appContext.ctx.req as any)['session'] = session;
      (appContext.ctx.req as any)['flags'] = flags;
    }
    return {
      pageProps: {
        ...pageProps,
        colorScheme,
        cookies: parsedCookies,
        session,
        flags,
        filtersOld,
        filters,
      },
      ...appProps,
    };
  }
};

export default trpc.withTRPC(MyApp);
