import { applyUserPreferences, applyBrowsingMode, cacheIt } from './../middleware.trpc';
import { getByIdSchema } from './../schema/base.schema';
import { publicProcedure } from './../trpc';
import {
  createPostHandler,
  updatePostHandler,
  getPostHandler,
  addPostImageHandler,
  reorderPostImagesHandler,
  deletePostHandler,
  addPostTagHandler,
  removePostTagHandler,
  getPostEditHandler,
  updatePostImageHandler,
  getPostTagsHandler,
  getPostsInfiniteHandler,
  getPostResourcesHandler,
} from './../controllers/post.controller';
import {
  postCreateSchema,
  postUpdateSchema,
  addPostImageSchema,
  reorderPostImagesSchema,
  addPostTagSchema,
  removePostTagSchema,
  updatePostImageSchema,
  getPostTagsSchema,
  postsQuerySchema,
  getPostsByCategorySchema,
} from './../schema/post.schema';
import { dbWrite } from '~/server/db/client';
import { router, protectedProcedure, middleware } from '~/server/trpc';
import { throwAuthorizationError } from '~/server/utils/errorHandling';
import { getPostsByCategory } from '~/server/services/post.service';

const isOwnerOrModerator = middleware(async ({ ctx, next, input = {} }) => {
  if (!ctx.user) throw throwAuthorizationError();

  const { id } = input as { id: number };

  const userId = ctx.user.id;
  const isModerator = ctx?.user?.isModerator;
  if (!isModerator && !!id) {
    const ownerId = (await dbWrite.post.findUnique({ where: { id }, select: { userId: true } }))
      ?.userId;
    if (ownerId !== userId) throw throwAuthorizationError();
  }

  return next({
    ctx: {
      // infers the `user` as non-nullable
      user: ctx.user,
    },
  });
});

// TODO.hotfix: added this middleware to allow editing images and check if it's the owner
const isImageOwnerOrModerator = middleware(async ({ ctx, next, input = {} }) => {
  if (!ctx.user) throw throwAuthorizationError();

  const { id } = input as { id: number };

  const userId = ctx.user.id;
  const isModerator = ctx?.user?.isModerator;
  if (!isModerator && !!id) {
    const ownerId = (await dbWrite.image.findUnique({ where: { id }, select: { userId: true } }))
      ?.userId;
    if (ownerId !== userId) throw throwAuthorizationError();
  }

  return next({
    ctx: {
      // infers the `user` as non-nullable
      user: ctx.user,
    },
  });
});

export const postRouter = router({
  getInfinite: publicProcedure
    .input(postsQuerySchema)
    .use(applyUserPreferences())
    .use(applyBrowsingMode())
    .query(getPostsInfiniteHandler),
  get: publicProcedure.input(getByIdSchema).query(getPostHandler),
  getEdit: protectedProcedure.input(getByIdSchema).query(getPostEditHandler),
  create: protectedProcedure.input(postCreateSchema).mutation(createPostHandler),
  update: protectedProcedure
    .input(postUpdateSchema)
    .use(isOwnerOrModerator)
    .mutation(updatePostHandler),
  delete: protectedProcedure
    .input(getByIdSchema)
    .use(isOwnerOrModerator)
    .mutation(deletePostHandler),
  addImage: protectedProcedure
    .input(addPostImageSchema)
    .use(isOwnerOrModerator)
    .mutation(addPostImageHandler),
  updateImage: protectedProcedure
    .input(updatePostImageSchema)
    .use(isImageOwnerOrModerator)
    .mutation(updatePostImageHandler),
  reorderImages: protectedProcedure
    .input(reorderPostImagesSchema)
    .use(isOwnerOrModerator)
    .mutation(reorderPostImagesHandler),
  getTags: publicProcedure
    .input(getPostTagsSchema)
    .use(applyUserPreferences())
    .query(getPostTagsHandler),
  addTag: protectedProcedure
    .input(addPostTagSchema)
    .use(isOwnerOrModerator)
    .mutation(addPostTagHandler),
  removeTag: protectedProcedure
    .input(removePostTagSchema)
    .use(isOwnerOrModerator)
    .mutation(removePostTagHandler),
  getResources: publicProcedure.input(getByIdSchema).query(getPostResourcesHandler),
  getPostsByCategory: publicProcedure
    .input(getPostsByCategorySchema)
    .use(applyUserPreferences())
    .use(cacheIt())
    .query(({ input }) => getPostsByCategory(input)),
});
