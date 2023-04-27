import { createStyles, UnstyledButton, Center } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons';

import { EdgeImage } from '~/components/EdgeImage/EdgeImage';
import { useImageDetailContext } from '~/components/Image/Detail/ImageDetailProvider';
import { ImageGuard } from '~/components/ImageGuard/ImageGuard';
import { MediaHash } from '~/components/ImageHash/ImageHash';
import { useAspectRatioFit } from '~/hooks/useAspectRatioFit';

type GalleryCarouselProps = {
  className?: string;
};

/**NOTES**
  - when our current image is not found in the images array, we can navigate away from it, but we can't use the arrows to navigate back to it.
*/
const maxIndicators = 20;
export function ImageDetailCarousel({ className }: GalleryCarouselProps) {
  // const router = useRouter();
  const { classes, cx } = useStyles();
  const {
    images,
    image: current,
    next,
    previous,
    navigate,
    canNavigate,
    connect,
  } = useImageDetailContext();

  const { setRef, height, width } = useAspectRatioFit({
    height: current?.height ?? 1200,
    width: current?.width ?? 1200,
  });

  // #region [navigation]
  useHotkeys([
    ['ArrowLeft', previous],
    ['ArrowRight', next],
  ]);
  // #endregion

  if (!current) return null;

  const indicators = images.map(({ id }) => (
    <UnstyledButton
      key={id}
      data-active={current.id === id || undefined}
      className={classes.indicator}
      aria-hidden
      tabIndex={-1}
      onClick={() => navigate(id)}
    />
  ));

  return (
    <div ref={setRef} className={cx(classes.root, className)}>
      {canNavigate && (
        <>
          <UnstyledButton className={cx(classes.control, classes.prev)} onClick={previous}>
            <IconChevronLeft />
          </UnstyledButton>
          <UnstyledButton className={cx(classes.control, classes.next)} onClick={next}>
            <IconChevronRight />
          </UnstyledButton>
        </>
      )}
      <ImageGuard
        images={[current]}
        connect={connect}
        render={(image) => {
          return (
            <Center
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
              }}
            >
              <Center
                style={{
                  position: 'relative',
                  height: height,
                  width: width,
                }}
              >
                <ImageGuard.ToggleConnect
                  position="top-left"
                  sx={(theme) => ({ borderRadius: theme.radius.sm })}
                />
                <ImageGuard.ToggleImage
                  position="top-left"
                  sx={(theme) => ({ borderRadius: theme.radius.sm })}
                />
                <ImageGuard.Report />
                <ImageGuard.Unsafe>
                  <MediaHash {...image} />
                </ImageGuard.Unsafe>
                <ImageGuard.Safe>
                  <EdgeImage
                    src={image.url}
                    name={image.name ?? image.id.toString()}
                    alt={image.name ?? undefined}
                    style={{ maxHeight: '100%', maxWidth: '100%' }}
                    width={image.width ?? 1200}
                    anim
                  />
                </ImageGuard.Safe>
              </Center>
            </Center>
          );
        }}
      />
      {images.length <= maxIndicators && images.length > 1 && (
        <div className={classes.indicators}>{indicators}</div>
      )}
    </div>
  );
}

const useStyles = createStyles((theme, _props, getRef) => {
  return {
    root: {
      position: 'relative',
    },
    center: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
    },

    prev: { ref: getRef('prev') },
    next: { ref: getRef('next') },
    control: {
      position: 'absolute',
      // top: 0,
      // bottom: 0,
      top: '50%',
      transform: 'translateY(-50%)',
      zIndex: 10,

      svg: {
        height: 50,
        width: 50,
      },

      [`&.${getRef('prev')}`]: {
        left: 0,
      },
      [`&.${getRef('next')}`]: {
        right: 0,
      },

      '&:hover': {
        color: theme.colors.blue[3],
      },
    },
    indicators: {
      position: 'absolute',
      bottom: theme.spacing.md,
      top: undefined,
      left: 0,
      right: 0,
      display: 'flex',
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 8,
      pointerEvents: 'none',
    },

    indicator: {
      pointerEvents: 'all',
      width: 25,
      height: 5,
      borderRadius: 10000,
      backgroundColor: theme.white,
      boxShadow: theme.shadows.sm,
      opacity: 0.6,
      transition: `opacity 150ms ${theme.transitionTimingFunction}`,

      '&[data-active]': {
        opacity: 1,
      },
    },
  };
});
