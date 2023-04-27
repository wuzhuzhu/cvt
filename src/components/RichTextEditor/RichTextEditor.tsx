import {
  Button,
  createStyles,
  CSSObject,
  Group,
  Input,
  InputWrapperProps,
  MantineSize,
  Stack,
  Text,
} from '@mantine/core';
import { closeModal, openModal } from '@mantine/modals';
import { Link, RichTextEditor as RTE, RichTextEditorProps } from '@mantine/tiptap';
import { IconAlertTriangle } from '@tabler/icons';
import Image from '@tiptap/extension-image';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Youtube from '@tiptap/extension-youtube';
import { BubbleMenu, Editor, Extension, Extensions, nodePasteRule, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useImperativeHandle, useRef } from 'react';
import { validateThirdPartyUrl } from '~/utils/string-helpers';

import { InsertImageControl } from './InsertImageControl';
import { InsertYoutubeVideoControl } from './InsertYoutubeVideoControl';
import { getSuggestions } from './suggestion';

// const mapEditorSizeHeight: Omit<Record<MantineSize, string>, 'xs'> = {
//   sm: '30px',
//   md: '50px',
//   lg: '70px',
//   xl: '90px',
// };

const mapEditorSize: Omit<Record<MantineSize, CSSObject>, 'xs'> = {
  sm: {
    minHeight: 30,
    fontSize: 14,
  },
  md: {
    minHeight: 50,
  },
  lg: {
    minHeight: 70,
  },
  xl: {
    minHeight: 90,
  },
};

const useStyles = createStyles((theme) => ({
  mention: {
    color: theme.colors.blue[4],
  },
}));

function openLinkWhitelistRequestModal() {
  return openModal({
    title: (
      <Group spacing="xs">
        <IconAlertTriangle color="gold" />
        <Text size="lg">Blocked URL</Text>
      </Group>
    ),
    children: (
      <Text>
        The URL you entered is not allowed. You can submit a request to add it to the whitelist.
        Please follow{' '}
        <Text
          component="a"
          variant="link"
          href="https://forms.gle/MzMCVA4mq3r4osv6A"
          target="_blank"
          rel="noopener noreferrer"
        >
          this link
        </Text>{' '}
        to do so.
      </Text>
    ),
  });
}

const LinkWithValidation = Link.extend({
  onUpdate() {
    const url = this.editor.getAttributes('link')?.href;

    if (url) {
      const valid = validateThirdPartyUrl(url);
      if (!valid) {
        this.editor.chain().focus().extendMarkRange('link').unsetLink().run();
        openLinkWhitelistRequestModal();
      }
    }
  },
}).configure({
  validate: (url) => {
    const valid = validateThirdPartyUrl(url);
    if (!valid) openLinkWhitelistRequestModal();

    return valid;
  },
});

export function RichTextEditor({
  id,
  label,
  description,
  withAsterisk,
  error,
  placeholder,
  value,
  onChange,
  includeControls = ['formatting'],
  disabled = false,
  hideToolbar = false,
  editorSize = 'sm',
  reset = 0,
  autoFocus,
  defaultSuggestions,
  innerRef,
  onSuperEnter,
  withLinkValidation,
  ...props
}: Props) {
  const { classes } = useStyles();
  const addHeading = includeControls.includes('heading');
  const addFormatting = includeControls.includes('formatting');
  const addList = includeControls.includes('list');
  const addLink = includeControls.includes('link');
  const addMedia = includeControls.includes('media');
  const addMentions = includeControls.includes('mentions');

  const linkExtension = withLinkValidation ? LinkWithValidation : Link;

  const extensions: Extensions = [
    Placeholder.configure({ placeholder }),
    StarterKit.configure({
      heading: !addHeading ? false : { levels: [1, 2, 3] },
      bulletList: !addList ? false : undefined,
      orderedList: !addList ? false : undefined,
      bold: !addFormatting ? false : undefined,
      italic: !addFormatting ? false : undefined,
      strike: !addFormatting ? false : undefined,
      code: !addFormatting ? false : undefined,
      blockquote: !addFormatting ? false : undefined,
      codeBlock: !addFormatting ? false : undefined,
    }),
    ...(onSuperEnter
      ? [
          Extension.create({
            name: 'onSubmitShortcut',
            addKeyboardShortcuts: () => ({
              'Mod-Enter': () => {
                onSuperEnter();
                return true; // Dunno why they want a boolean here
              },
            }),
          }),
        ]
      : []),
    ...(addFormatting ? [Underline] : []),
    ...(addLink ? [linkExtension] : []),
    ...(addMedia
      ? [
          Image,
          Youtube.configure({
            // Casting width as any to be able to use `100%`
            // since the tiptap extension API doesn't allow
            // strings for its value
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            width: '100%' as any,
            addPasteHandler: false,
            modestBranding: false,
          }).extend({
            addPasteRules() {
              return [
                nodePasteRule({
                  find: /^(https?:\/\/)?(www\.|music\.)?(youtube\.com|youtu\.be)(?!.*\/channel\/)(?!\/@)(.+)?$/g,
                  type: this.type,
                  getAttributes: (match) => ({ src: match.input }),
                }),
              ];
            },
          }),
        ]
      : []),
    ...(addMentions
      ? [
          Mention.configure({
            suggestion: getSuggestions({ defaultSuggestions }),
            HTMLAttributes: {
              class: classes.mention,
            },
            renderLabel({ options, node }) {
              return `${options.suggestion.char}${node.attrs.label ?? node.attrs.id}`;
            },
          }),
        ]
      : []),
  ];

  const editor = useEditor({
    extensions,
    content: value,
    onUpdate: onChange ? ({ editor }) => onChange(editor.getHTML()) : undefined,
    editable: !disabled,
  });

  const editorRef = useRef<Editor>();

  // To clear content after a form submission
  useEffect(() => {
    if (!value && editor) editor.commands.clearContent();
  }, [editor, value]);

  useEffect(() => {
    if (reset > 0 && editor && value && editor.getHTML() !== value) {
      editor.commands.setContent(value);
    }
  }, [reset]); //eslint-disable-line

  useEffect(() => {
    if (editor && autoFocus) editor.commands.focus('end', { scrollIntoView: true });
  }, [editor, autoFocus]);

  useEffect(() => {
    if (editor && !editorRef.current) editorRef.current = editor;
  }, [editor]);

  // Used to call editor commands outside the component via a ref
  useImperativeHandle(innerRef, () => ({
    insertContentAtCursor: (value) => {
      if (editorRef.current && innerRef) {
        const currentPosition = editorRef.current.state.selection.$anchor.pos;
        editorRef.current.commands.insertContentAt(currentPosition, value);
      }
    },
    focus: () => {
      if (editorRef.current && innerRef) {
        editorRef.current.commands.focus('end');
      }
    },
  }));

  return (
    <Input.Wrapper
      id={id}
      label={label}
      description={description}
      withAsterisk={withAsterisk}
      error={error}
    >
      <RTE
        {...props}
        editor={editor}
        id={id}
        sx={(theme) => ({
          marginTop: description ? 5 : undefined,
          marginBottom: error ? 5 : undefined,
          borderColor: error ? theme.colors.red[8] : undefined,

          // Fixes gapcursor color for dark mode
          '& .ProseMirror-gapcursor:after': {
            borderTop: `1px solid ${theme.colorScheme === 'dark' ? 'white' : 'black'}`,
          },

          '& .ProseMirror': {
            ...mapEditorSize[editorSize],
            // minHeight: mapEditorSizeHeight[editorSize],

            '& p.is-editor-empty:first-of-type::before': {
              color: error ? theme.colors.red[8] : undefined,
            },
          },
        })}
      >
        {!hideToolbar && (
          <RTE.Toolbar>
            {addHeading && (
              <RTE.ControlsGroup>
                <RTE.H1 />
                <RTE.H2 />
                <RTE.H3 />
              </RTE.ControlsGroup>
            )}

            {addFormatting && (
              <RTE.ControlsGroup>
                <RTE.Bold />
                <RTE.Italic />
                <RTE.Underline />
                <RTE.Strikethrough />
                <RTE.ClearFormatting />
              </RTE.ControlsGroup>
            )}

            {addList && (
              <RTE.ControlsGroup>
                <RTE.BulletList />
                <RTE.OrderedList />
              </RTE.ControlsGroup>
            )}

            {addLink && (
              <RTE.ControlsGroup>
                <RTE.Link />
                <RTE.Unlink />
              </RTE.ControlsGroup>
            )}

            {addMedia && (
              <RTE.ControlsGroup>
                <InsertImageControl />
                <InsertYoutubeVideoControl />
              </RTE.ControlsGroup>
            )}
          </RTE.Toolbar>
        )}

        {editor && (
          <BubbleMenu editor={editor}>
            <RTE.ControlsGroup>
              {addFormatting ? (
                <>
                  <RTE.Bold />
                  <RTE.Italic />
                </>
              ) : null}
              {addList ? <RTE.BulletList /> : null}
              {addLink ? <RTE.Link /> : null}
            </RTE.ControlsGroup>
          </BubbleMenu>
        )}

        <RTE.Content />
      </RTE>
    </Input.Wrapper>
  );
}

export type EditorCommandsRef = {
  insertContentAtCursor: (value: string) => void;
  focus: () => void;
};

type ControlType = 'heading' | 'formatting' | 'list' | 'link' | 'media' | 'mentions';
type Props = Omit<RichTextEditorProps, 'editor' | 'children' | 'onChange'> &
  Pick<InputWrapperProps, 'label' | 'description' | 'withAsterisk' | 'error'> & {
    value?: string;
    includeControls?: ControlType[];
    onChange?: (value: string) => void;
    disabled?: boolean;
    hideToolbar?: boolean;
    editorSize?: 'sm' | 'md' | 'lg' | 'xl';
    reset?: number;
    autoFocus?: boolean;
    defaultSuggestions?: Array<{ id: number; label: string }>;
    innerRef?: React.ForwardedRef<EditorCommandsRef>;
    onSuperEnter?: () => void;
    withLinkValidation?: boolean;
  };
