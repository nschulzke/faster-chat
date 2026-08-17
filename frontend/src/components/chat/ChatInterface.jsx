import SidebarToolbar from "@/components/layout/SidebarToolbar";
import ErrorBanner from "@/components/ui/ErrorBanner";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ToolbarGroup } from "@/components/ui/ToolbarGroup";
import { UserMenu } from "@/components/ui/UserMenu";
import { useChat } from "@/hooks/useChat";
import { useChatVoice } from "@/hooks/useChatVoice";
import { useChatMemoryEnabled } from "@/hooks/useMemoryStatus";
import { useChatNavigation } from "@/hooks/useChatNavigation";
import { useCreateChatMutation, useCreateMessageMutation } from "@/hooks/useChatsQuery";
import { useImageGeneration } from "@/hooks/useImageGeneration";
import { useEditResubmit } from "@/hooks/useEditResubmit";
import { usePendingResubmit } from "@/hooks/usePendingResubmit";
import { usePreferredModel } from "@/hooks/usePreferredModel";
import { useUiState } from "@/state/useUiState";

import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { toast, Toaster } from "sonner";
import EditMessageDialog from "./EditMessageDialog";
import InputArea from "./InputArea";
import SearchHighlightBar from "./SearchHighlightBar";
import MessageList from "./MessageList";
import ModelSelector from "./ModelSelector";
import VoiceSettings from "./VoiceSettings";
import VoiceStatusIndicator from "./VoiceStatusIndicator";

const ChatInterface = ({ chatId }) => {
  const { navigateToChat } = useChatNavigation();
  const navigate = useNavigate();
  const searchParams = useSearch({ strict: false });
  const createChatMutation = useCreateChatMutation();
  const imageMode = useUiState((state) => state.imageMode);
  const preferredImageModel = useUiState((state) => state.preferredImageModel);
  const setPreferredImageModel = useUiState((state) => state.setPreferredImageModel);
  const autoScroll = useUiState((state) => state.autoScroll);
  const webSearchEnabled = useUiState((state) => state.webSearchEnabled);
  const toggleWebSearch = useUiState((state) => state.toggleWebSearch);
  const setWebSearchEnabled = useUiState((state) => state.setWebSearchEnabled);
  const setSearchOpen = useUiState((state) => state.setSearchOpen);
  const memoryEnabled = useChatMemoryEnabled(chatId);

  const {
    modelId: preferredModel,
    model: currentModelData,
    models,
    setModel,
  } = usePreferredModel();
  const modelSupportsTools = !!currentModelData?.metadata?.supports_tools;

  const handleModelChange = (modelId) => {
    setModel(modelId);
    clearError();
    const newModel = models.find((m) => m.model_id === modelId);
    if (!newModel?.metadata?.supports_tools) {
      setWebSearchEnabled(false);
    }
  };

  const handleNewChat = async () => {
    try {
      const newChat = await createChatMutation.mutateAsync();
      navigateToChat(newChat.id);
    } catch (err) {
      toast.error(err.message || "Failed to create new chat");
    }
  };
  const scrollContainerRef = useRef(null);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  const {
    messages,
    input,
    inputFiles,
    appendFiles,
    removeFile,
    handleInputChange,
    handleSubmit,
    submitMessage,
    error: chatError,
    clearError,
    isLoading,
    isMessagesLoading,
    status,
    stop,
    regenerate,
    resetStream,
    setInput,
  } = useChat({
    id: chatId,
    model: preferredModel,
    webSearchEnabled,
    memoryEnabled,
  });

  const { voice } = useChatVoice({
    messages,
    isLoading,
    setInput,
    submitMessage,
  });

  const createMessageMutation = useCreateMessageMutation();
  const { generate: generateImage, isGenerating } = useImageGeneration({
    onError: (error) => {
      toast.error(error.message || "Image generation failed");
    },
  });

  async function handleImageSubmit(prompt) {
    if (!prompt || !chatId) return;

    const userMessageId = crypto.randomUUID();
    const userCreatedAt = Date.now();
    await createMessageMutation.mutateAsync({
      chatId,
      message: {
        id: userMessageId,
        role: "user",
        content: `[Image Generation] ${prompt}`,
        createdAt: userCreatedAt,
      },
    });

    setInput("");

    generateImage(
      { prompt, chatId, model: preferredImageModel, excludeMessageId: userMessageId },
      {
        onSuccess: async (data) => {
          const assistantMessageId = crypto.randomUUID();
          await createMessageMutation.mutateAsync({
            chatId,
            message: {
              id: assistantMessageId,
              role: "assistant",
              content: `Generated image: "${prompt}"`,
              fileIds: [data.id],
              model: data.model,
              createdAt: Date.now(),
            },
          });
          toast.success("Image generated!");
        },
      }
    );
  }

  const editTargetIndex = editTarget
    ? messages.findIndex((msg) => msg.id === editTarget.messageId)
    : -1;
  const removedCount = editTargetIndex === -1 ? 0 : messages.length - editTargetIndex - 1;

  function handleEditRequest(target) {
    if (isLoading) {
      toast.error("Wait for the current response to finish");
      return;
    }
    setEditTarget(target);
  }

  async function handleEditResubmit(mode) {
    const target = editTarget;
    try {
      await resubmitEdit(target, mode);
      setEditTarget(null);
    } catch (err) {
      setEditTarget(null);
      toast.error(err.message || "Failed to edit message");
    }
  }

  const { resubmitEdit, isPending: isRewinding } = useEditResubmit({ chatId, resetStream });

  usePendingResubmit({ chatId, isMessagesLoading, submitMessage });

  // A search jump owns the scroll position until the user dismisses or replies.
  function clearSearchParams() {
    if (searchParams.q || searchParams.m) {
      navigate({ to: ".", search: {}, replace: true });
    }
  }

  function handleSubmitWithSearchCleared(e) {
    clearSearchParams();
    handleSubmit(e);
  }

  useLayoutEffect(() => {
    if (!scrollContainerRef.current || !autoScroll || searchParams.m) return;
    scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
  }, [messages.length, autoScroll, searchParams.m]);

  return (
    <div className="bg-theme-canvas relative z-0 flex h-full flex-1 flex-col">
      <Toaster position="top-center" theme="dark" richColors expand visibleToasts={3} />

      <div className="relative flex-1">
        <div className="sticky top-0 z-10 flex items-center justify-between px-2 py-3 md:px-8 md:py-6">
          <div className="flex items-center gap-3">
            <SidebarToolbar onNewChat={handleNewChat} onSearch={() => setSearchOpen(true)} />
          </div>

          {imageMode ? (
            <ModelSelector
              type="image"
              currentModel={preferredImageModel}
              onModelChange={setPreferredImageModel}
            />
          ) : (
            <ModelSelector currentModel={preferredModel} onModelChange={handleModelChange} />
          )}

          <ToolbarGroup>
            <VoiceStatusIndicator
              voiceControls={voice}
              onOpenSettings={() => setShowVoiceSettings(true)}
            />
            <ThemeToggle />
            <UserMenu />
          </ToolbarGroup>
        </div>

        <SearchHighlightBar containerRef={scrollContainerRef} messageCount={messages.length} />

        <div
          ref={scrollContainerRef}
          style={{ scrollbarGutter: "stable both-edges" }}
          className="absolute inset-0 overflow-y-scroll pt-12 pb-[180px] md:px-20">
          <div className="mx-auto max-w-4xl">
            <MessageList
              messages={messages}
              isLoading={isLoading}
              isGeneratingImage={isGenerating}
              status={status}
              onStop={stop}
              onRegenerate={regenerate}
              onEditMessage={handleEditRequest}
            />
          </div>
        </div>

        <div className="from-theme-canvas via-theme-canvas/80 pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t to-transparent" />

        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-6">
          <div className="pointer-events-auto relative mx-auto max-w-4xl">
            <ErrorBanner
              message={chatError?.message || chatError}
              onDismiss={clearError}
              className="mb-3"
            />

            <InputArea
              input={input}
              handleInputChange={handleInputChange}
              handleSubmit={handleSubmitWithSearchCleared}
              voiceControls={voice}
              disabled={isLoading || isGenerating}
              onImageSubmit={handleImageSubmit}
              webSearchEnabled={webSearchEnabled}
              onToggleWebSearch={toggleWebSearch}
              modelSupportsTools={modelSupportsTools}
              chatId={chatId}
              selectedFiles={inputFiles}
              onFilesUploaded={appendFiles}
              onRemoveFile={removeFile}
              isLoading={isLoading}
              isGenerating={isGenerating}
            />
          </div>
        </div>
      </div>

      {showVoiceSettings && (
        <VoiceSettings voiceControls={voice} onClose={() => setShowVoiceSettings(false)} />
      )}

      {editTarget && (
        <EditMessageDialog
          removedCount={removedCount}
          isPending={isRewinding}
          onCancel={() => setEditTarget(null)}
          onCopy={() => handleEditResubmit("copy")}
          onReplace={() => handleEditResubmit("replace")}
        />
      )}
    </div>
  );
};

export default ChatInterface;
