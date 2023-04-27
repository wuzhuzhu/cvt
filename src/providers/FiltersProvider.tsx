import { useRef, createContext, useContext, useCallback } from 'react';
import {
  CheckpointType,
  ImageGenerationProcess,
  MetricTimeframe,
  ModelStatus,
  ModelType,
} from '@prisma/client';
import {
  BrowsingMode,
  ImageSort,
  ModelSort,
  PostSort,
  QuestionSort,
  QuestionStatus,
} from '~/server/common/enums';
import { setCookie } from '~/utils/cookies-helpers';
import { createStore, useStore } from 'zustand';
import { devtools } from 'zustand/middleware';
import { z } from 'zod';
import { useCurrentUser } from '~/hooks/useCurrentUser';
import { constants } from '~/server/common/constants';
import { removeEmpty } from '~/utils/object-helpers';

type BrowsingModeSchema = z.infer<typeof browsingModeSchema>;
const browsingModeSchema = z.nativeEnum(BrowsingMode).default(BrowsingMode.NSFW);

export type ViewMode = z.infer<typeof viewModeSchema>;
const viewModeSchema = z.enum(['categories', 'feed']).default('categories');

export type ModelFilterSchema = z.infer<typeof modelFilterSchema>;
const modelFilterSchema = z.object({
  period: z.nativeEnum(MetricTimeframe).default(MetricTimeframe.AllTime),
  sort: z.nativeEnum(ModelSort).default(ModelSort.HighestRated),
  types: z.nativeEnum(ModelType).array().optional(),
  checkpointType: z.nativeEnum(CheckpointType).optional(),
  baseModels: z.enum(constants.baseModels).array().optional(),
  browsingMode: z.nativeEnum(BrowsingMode).optional(),
  status: z.nativeEnum(ModelStatus).array().optional(),
  earlyAccess: z.boolean().optional(),
  view: viewModeSchema,
});

type QuestionFilterSchema = z.infer<typeof questionFilterSchema>;
const questionFilterSchema = z.object({
  sort: z.nativeEnum(QuestionSort).default(QuestionSort.MostLiked),
  period: z.nativeEnum(MetricTimeframe).default(MetricTimeframe.AllTime),
  status: z.nativeEnum(QuestionStatus).optional(),
});

type ImageFilterSchema = z.infer<typeof imageFilterSchema>;
const imageFilterSchema = z.object({
  period: z.nativeEnum(MetricTimeframe).default(MetricTimeframe.AllTime),
  sort: z.nativeEnum(ImageSort).default(ImageSort.MostReactions),
  generation: z.nativeEnum(ImageGenerationProcess).array().optional(),
  view: viewModeSchema,
  excludeCrossPosts: z.boolean().optional(),
  // excludeCrossPosts: z.preprocess((value) => value !== 'true', z.boolean()).optional(),
});

type PostFilterSchema = z.infer<typeof postFilterSchema>;
const postFilterSchema = z.object({
  period: z.nativeEnum(MetricTimeframe).default(MetricTimeframe.Week),
  sort: z.nativeEnum(PostSort).default(PostSort.MostReactions),
  view: viewModeSchema,
});

export type CookiesState = {
  browsingMode: BrowsingModeSchema;
};

type StorageState = {
  models: ModelFilterSchema;
  questions: QuestionFilterSchema;
  images: ImageFilterSchema;
  modelImages: ImageFilterSchema;
  posts: PostFilterSchema;
};
export type FilterSubTypes = keyof StorageState;
export type ViewAdjustableTypes = 'models' | 'images' | 'posts';

type FilterState = CookiesState & StorageState;
export type FilterKeys<K extends keyof FilterState> = keyof Pick<FilterState, K>;

type StoreState = FilterState & {
  setBrowsingMode: (browsingMode: BrowsingMode) => void;
  setModelFilters: (filters: Partial<ModelFilterSchema>) => void;
  setQuestionFilters: (filters: Partial<QuestionFilterSchema>) => void;
  setImageFilters: (filters: Partial<ImageFilterSchema>) => void;
  setModelImageFilters: (filters: Partial<ImageFilterSchema>) => void;
  setPostFilters: (filters: Partial<PostFilterSchema>) => void;
};

type CookieStorageSchema = Record<keyof CookiesState, { key: string; schema: z.ZodTypeAny }>;
const cookieKeys: CookieStorageSchema = {
  browsingMode: { key: 'mode', schema: browsingModeSchema },
};

type LocalStorageSchema = Record<keyof StorageState, { key: string; schema: z.AnyZodObject }>;
const localStorageSchemas: LocalStorageSchema = {
  models: { key: 'model-filters', schema: modelFilterSchema },
  questions: { key: 'question-filters', schema: questionFilterSchema },
  images: { key: 'image-filters', schema: imageFilterSchema },
  modelImages: { key: 'model-image-filters', schema: imageFilterSchema },
  posts: { key: 'post-filters', schema: postFilterSchema },
};

export const parseFilterCookies = (cookies: Partial<{ [key: string]: string }>) => {
  return Object.entries(cookieKeys).reduce<Record<string, unknown>>((acc, [key, storage]) => {
    const cookieValue = cookies[storage.key];
    const parsedValue = cookieValue ? deserializeJSON(cookieValue) : undefined;
    const result = storage.schema.safeParse(parsedValue);
    const value = result.success ? result.data : storage.schema.parse(undefined);
    return { ...acc, [key]: value };
  }, {}) as CookiesState;
};

const getInitialValues = <TSchema extends z.AnyZodObject>({
  key,
  schema,
}: {
  key: string;
  schema: TSchema;
}) => {
  if (typeof window === 'undefined') return schema.parse({});
  const storageValue = localStorage.getItem(key) ?? '{}';
  const value = deserializeJSON(storageValue);
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  else {
    // if the data failed to parse, get new defaults and update localstorage
    const defaults = schema.parse({});
    localStorage.setItem(key, serializeJSON(defaults));
    return defaults;
  }
};

const getInitialLocalStorageValues = () =>
  Object.entries(localStorageSchemas).reduce<Record<string, unknown>>(
    (acc, [key, value]) => ({
      ...acc,
      [key]: getInitialValues({ key: value.key, schema: value.schema }),
    }),
    {}
  ) as StorageState;

function handleLocalStorageChange<TKey extends keyof StorageState>({
  key,
  data,
  state,
}: {
  key: TKey;
  data: Record<string, unknown>;
  state: StoreState;
}) {
  const values = removeEmpty({ ...state[key], ...data });
  localStorage.setItem(localStorageSchemas[key].key, serializeJSON(values));
  return { [key]: values } as StoreState | Partial<StoreState>;
}

type FilterStore = ReturnType<typeof createFilterStore>;
const createFilterStore = (initialValues: CookiesState) =>
  createStore<StoreState>()(
    devtools((set) => ({
      ...initialValues,
      ...getInitialLocalStorageValues(),
      setBrowsingMode: (browsingMode) => {
        setCookie(cookieKeys.browsingMode.key, browsingMode);
        set({ browsingMode });
      },
      setModelFilters: (data) =>
        set((state) => handleLocalStorageChange({ key: 'models', data, state })),
      setQuestionFilters: (data) =>
        set((state) => handleLocalStorageChange({ key: 'questions', data, state })),
      setImageFilters: (data) =>
        set((state) => handleLocalStorageChange({ key: 'images', data, state })),
      setModelImageFilters: (data) =>
        set((state) => handleLocalStorageChange({ key: 'modelImages', data, state })),
      setPostFilters: (data) =>
        set((state) => handleLocalStorageChange({ key: 'posts', data, state })),
    }))
  );

const FiltersContext = createContext<FilterStore | null>(null);
export function useFiltersContext<T>(selector: (state: StoreState) => T) {
  const store = useContext(FiltersContext);
  if (!store) throw new Error('Missing FiltersContext.Provider in the tree');
  return useStore(store, selector);
}

export const FiltersProvider = ({
  children,
  value,
}: {
  children: React.ReactNode;
  value: CookiesState;
}) => {
  const currentUser = useCurrentUser();
  const storeRef = useRef<FilterStore>();
  if (!storeRef.current) {
    if (!currentUser?.showNsfw) value.browsingMode = BrowsingMode.SFW;
    storeRef.current = createFilterStore({ ...value });
  }

  return <FiltersContext.Provider value={storeRef.current}>{children}</FiltersContext.Provider>;
};

function serializeJSON<T>(value: T) {
  try {
    return JSON.stringify(value);
  } catch (error) {
    throw new Error(`Failed to serialize the value`);
  }
}

function deserializeJSON(value: string) {
  try {
    return JSON.parse(decodeURIComponent(value));
  } catch {
    return value;
  }
}

export function useSetFilters(type: FilterSubTypes) {
  return useFiltersContext(
    useCallback(
      (state) =>
        ({
          models: state.setModelFilters,
          posts: state.setPostFilters,
          images: state.setImageFilters,
          questions: state.setQuestionFilters,
          modelImages: state.setModelImageFilters,
        }[type]),
      [type]
    )
  );
}
