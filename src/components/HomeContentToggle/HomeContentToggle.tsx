import { SegmentedControl, SegmentedControlItem, SegmentedControlProps } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { useRouter } from 'next/router';
import { useFeatureFlags } from '~/providers/FeatureFlagsProvider';

const homeOptions = {
  models: '/',
  images: '/images',
  posts: '/posts',
} as const;
type HomeOptions = keyof typeof homeOptions;

export function useHomeSelection() {
  const [home, setHome] = useLocalStorage<HomeOptions>({
    key: 'home-selection',
    defaultValue: 'models',
  });

  const url = homeOptions[home];
  const set = (value: HomeOptions) => {
    setHome(value);
    return homeOptions[value];
  };

  return { home, url, set };
}

export function HomeContentToggle({ size, sx, ...props }: Props) {
  const router = useRouter();
  const { set } = useHomeSelection();
  const features = useFeatureFlags();

  const data: SegmentedControlItem[] = [
    { label: 'Models', value: 'models' },
    { label: 'Images', value: 'images' },
  ];
  if (features.posts) data.push({ label: 'Posts', value: 'posts' });

  return (
    <SegmentedControl
      {...props}
      sx={(theme) => ({
        ...(typeof sx === 'function' ? sx(theme) : sx),
      })}
      styles={(theme) => ({
        label: {
          [theme.fn.largerThan('xs')]: {
            paddingTop: 0,
            paddingBottom: 0,
          },
        },
      })}
      value={
        router.pathname === '/images' ? 'images' : router.pathname === '/posts' ? 'posts' : 'models'
      }
      onChange={(value) => {
        const url = set(value as HomeOptions);
        router.push(url);
      }}
      data={data}
    />
  );
}

type Props = {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
} & Omit<SegmentedControlProps, 'data' | 'value' | 'onChange'>;
