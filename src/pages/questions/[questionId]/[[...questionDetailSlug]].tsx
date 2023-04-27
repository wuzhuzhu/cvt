import { Container, createStyles, Group, Stack, Title } from '@mantine/core';
import { InferGetServerSidePropsType } from 'next';
import { useRouter } from 'next/router';
import { NotFound } from '~/components/AppLayout/NotFound';
import { Meta } from '~/components/Meta/Meta';
import { QuestionForm } from '~/components/Questions/QuestionForm';
import { useCurrentUser } from '~/hooks/useCurrentUser';
import { removeTags } from '~/utils/string-helpers';
import { trpc } from '~/utils/trpc';
import { isNumber } from '~/utils/type-guards';
import { AnswerDetail } from '~/components/Questions/AnswerDetail';
import { AnswerForm } from '~/components/Questions/AnswerForm';
import { dbRead } from '~/server/db/client';
import { slugit } from '~/utils/string-helpers';
import React from 'react';
import { QuestionDetails } from '~/components/Questions/QuestionDetails';
import truncate from 'lodash/truncate';
import { createServerSideProps } from '~/server/utils/server-side-helpers';

export const getServerSideProps = createServerSideProps<{
  id: number;
  title: string;
}>({
  useSSG: true,
  resolver: async ({ ssg, ctx }) => {
    const params = (ctx.params ?? {}) as {
      questionId: string;
      questionDetailSlug: string[] | undefined;
    };
    const questionId = Number(params.questionId);
    const questionTitle = params.questionDetailSlug?.[0];
    if (!isNumber(questionId))
      return {
        notFound: true,
      };

    if (!questionTitle) {
      const question = await dbRead.question.findUnique({
        where: { id: questionId },
        select: { title: true },
      });
      if (question?.title) {
        const [pathname, query] = ctx.resolvedUrl.split('?');
        let destination = `${pathname}/${slugit(question.title)}`;
        if (query) destination += `?${query}`;
        return {
          redirect: {
            permanent: false,
            destination,
          },
        };
      }
      return {
        notFound: true,
      };
    }

    if (ssg) {
      await ssg.question.getById.prefetch({ id: questionId });
      await ssg.answer.getAll.prefetch({ questionId });
    }

    return {
      props: {
        id: questionId,
        title: questionTitle,
      },
    };
  },
});

export default function QuestionPage(
  props: InferGetServerSidePropsType<typeof getServerSideProps>
) {
  const { id } = props;
  const router = useRouter();
  const user = useCurrentUser();
  const editing = router.query.edit;
  const { classes } = useStyles();

  const { data: question, isLoading: questionsLoading } = trpc.question.getById.useQuery({ id });
  const { data: answers, isLoading: answersLoading } = trpc.answer.getAll.useQuery({
    questionId: id,
  });

  const isModerator = user?.isModerator ?? false;
  const isOwner = user?.id === question?.user.id;

  if (!question) return <NotFound />;
  // TODO - inline this with question content instead of displaying as a separate page
  if (editing && question && (isOwner || isModerator)) return <QuestionForm question={question} />;

  return (
    <>
      <Meta
        title={`${question.title} | Civitai`}
        description={truncate(removeTags(question.content ?? ''), { length: 150 })}
        // TODO - determine if we need to do anything to handle content that has images/videos in it
      />
      <Container pb={60} px="xs">
        <Stack>
          <QuestionDetails question={question} />
          {!!answers?.length && (
            <div className={classes.fullWidth}>
              <Group noWrap>
                <Title order={2}>
                  {answers.length} {answers.length === 1 ? 'Answer' : 'Answers'}
                </Title>
              </Group>
            </div>
          )}
          {answers?.map((answer) => (
            <AnswerDetail key={answer.id} answer={answer} question={question} />
          ))}
          {!answers?.some((x) => x.user.id === user?.id) && !user?.muted && (
            <Stack>
              <Title order={3}>Your anwser</Title>
              <AnswerForm questionId={id} />
            </Stack>
          )}
        </Stack>
      </Container>
    </>
  );
}

const useStyles = createStyles((theme) => ({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'min-content 1fr',
    columnGap: theme.spacing.md,
    rowGap: theme.spacing.md,
  },
  fullWidth: {
    gridColumn: '1/-1',
  },
  row: {
    display: 'contents',
  },
}));
