import { createStyles, Group, Title } from '@mantine/core';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { ModelCard } from '~/components/ModelCard/ModelCard';
import { getUsers } from '../server/services/users';

type ServerSideProps = {
  users: Awaited<ReturnType<typeof getUsers>>;
};

export const getServerSideProps: GetServerSideProps<ServerSideProps> = async (ctx) => ({
  props: {
    users: await getUsers(),
  },
});

function Home(props: ServerSideProps) {
  // const { data: session, status } = useSession();
  // const { data } = trpc.example.hello.useQuery({ text: 'from tRPC' });
  const { classes } = useStyles();
  console.log(props.users);

  return (
    <>
      <Head>
        <title>Create T3 App</title>
        <meta name="description" content="Generated by create-t3-app" />
      </Head>
      <Group p="md">
        <Title>This is the home page</Title>
      </Group>
      <div className={classes.gridLayout}>
        <ModelCard id={1} name="bob" />
        <ModelCard id={1} name="bob" />
        <ModelCard id={1} name="bob" />
        <ModelCard id={1} name="bob" />
        <ModelCard id={1} name="bob" />
        <ModelCard id={1} name="bob" />
        <ModelCard id={1} name="bob" />
        <ModelCard id={1} name="bob" />
        <ModelCard id={1} name="bob" />
        <ModelCard id={1} name="bob" />
        <ModelCard id={1} name="bob" />
        <ModelCard id={1} name="bob" />
      </div>
    </>
  );
}

// Home.getLayout = (page: React.ReactElement) => <>{page}</>;
export default Home;

const useStyles = createStyles((theme) => ({
  gridLayout: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, 300px)',
    gap: '16px',
    justifyContent: 'center',
  },
}));
