'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  type AgentState,
  type ReceivedChatMessage,
  useRoomContext,
  useVoiceAssistant,
} from '@livekit/components-react';
import { toastAlert } from '@/components/alert-toast';
import { AgentControlBar } from '@/components/livekit/agent-control-bar/agent-control-bar';
import { ChatEntry } from '@/components/livekit/chat/chat-entry';
import { ChatMessageView } from '@/components/livekit/chat/chat-message-view';
import { MediaTiles } from '@/components/livekit/media-tiles';
import useChatAndTranscription from '@/hooks/useChatAndTranscription';
import { useDebugMode } from '@/hooks/useDebug';
import type { AppConfig } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { DataPacket_Kind, RoomEvent, RemoteParticipant } from "livekit-client";

function isAgentAvailable(agentState: AgentState) {
  return agentState === 'listening' || agentState === 'thinking' || agentState === 'speaking';
}

interface SessionViewProps {
  appConfig: AppConfig;
  disabled: boolean;
  sessionStarted: boolean;
}

export const SessionView = ({
  appConfig,
  disabled,
  sessionStarted,
  ref,
}: React.ComponentProps<'div'> & SessionViewProps) => {
  const { state: agentState } = useVoiceAssistant();
  const [chatOpen, setChatOpen] = useState(false);
  const { messages, send } = useChatAndTranscription();
  const room = useRoomContext();
  const router = useRouter();

  useDebugMode({ enabled: process.env.NODE_END !== 'production' });

  async function handleSendMessage(message: string) {
    console.log("📤 Envoi message:", message);
    await send(message);
  }

useEffect(() => {
  if (!room) {
    console.log("⚠️ Room non prête, attente...");
    return;
  }

  if (!messages || messages.length === 0) {
    console.log("ℹ️ Aucun message reçu encore");
    return;
  }

  let reportAlreadyTriggered = false;

  const triggerReport = async () => {
    if (reportAlreadyTriggered) {
      console.log("⏭ Rapport déjà déclenché, on ignore...");
      return;
    }
    reportAlreadyTriggered = true;

    try {
      console.log("🛠 Préparation du dialogue pour la génération du rapport...");
      const dialogue = messages.map((msg: any) => {
        let speaker = "Patient";
        if (msg.from && typeof msg.from === "string") {
          speaker = msg.from.toLowerCase().includes("agent") ? "AI" : "Patient";
        }
        return {
          speaker,
          text: msg.message || msg.text || msg.content || "",
        };
      });

      const payload = {
        type: "GENERATE_REPORT",
        data: {
          dialogue,
          meta: {
            sessionId: room.name,
            requestedAt: new Date().toISOString(),
          },
        },
      };

      console.log("📤 Envoi de la demande de rapport via sendText...");
      await room.localParticipant.sendText(JSON.stringify(payload), {
        topic: "report-request", // important pour backend
      });

      toastAlert({
        title: "Report requested",
        description: "La demande de génération de rapport a été envoyée.",
      });
    } catch (err) {
      console.error("❌ Échec de l'envoi de la demande de rapport :", err);
      toastAlert({
        title: "Failed to request report",
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleMessage = (msg: any) => {
    const messageText =
      msg?.message ||
      msg?.text ||
      msg?.content ||
      msg?.body ||
      (typeof msg === "string" ? msg : null);

    if (!messageText) return;

    const normalized = messageText.trim().toUpperCase();
    if (normalized.includes("[SESSION_END]")) {
      console.log("✅ [SESSION_END] détecté → demande de génération de rapport...");
      triggerReport();
    }
  };

  messages.forEach(handleMessage);

  console.log(`✅ Total messages détectés au montage : ${messages.length}`);

  // --- Plus besoin de gérer REPORT_RESULT côté front ---
  // Le backend enverra directement le rapport au backend sur le port 5000.

  return () => {
    room.off(RoomEvent.DataReceived, () => {});
  };
}, [messages, room, router]);

  useEffect(() => {
    if (sessionStarted) {
      console.log("⏳ Session démarrée, vérification état agent...");
      const timeout = setTimeout(() => {
        if (!isAgentAvailable(agentState)) {
          const reason =
            agentState === 'connecting'
              ? 'Agent did not join the room. '
              : 'Agent connected but did not complete initializing. ';
          console.log("⚠️ Session interrompue:", reason);

          toastAlert({
            title: 'Session ended',
            description: (
              <p className="w-full">
                {reason}
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  href="https://docs.livekit.io/agents/start/voice-ai/"
                  className="whitespace-nowrap underline"
                >
                  See quickstart guide
                </a>
                .
              </p>
            ),
          });
          room.disconnect();
        }
      }, 20_000);
      return () => clearTimeout(timeout);
    }
  }, [agentState, sessionStarted, room]);

  const { supportsChatInput, supportsVideoInput, supportsScreenShare } = appConfig;
  const capabilities = { supportsChatInput, supportsVideoInput, supportsScreenShare };

  const handleDisconnect = () => {
    console.log("🔌 Déconnexion forcée de la room...");
    room.disconnect();
    router.push('http://localhost:5173/patient');
  };
  
  return (
    <section
      ref={ref}
      inert={disabled}
      className={cn(
        'opacity-0',
        // prevent page scrollbar
        // when !chatOpen due to 'translate-y-20'
        !chatOpen && 'max-h-svh overflow-hidden'
      )}
    >
      <ChatMessageView
        className={cn(
          'mx-auto min-h-svh w-full max-w-2xl px-3 pt-32 pb-40 transition-[opacity,translate] duration-300 ease-out md:px-0 md:pt-36 md:pb-48',
          chatOpen ? 'translate-y-0 opacity-100 delay-200' : 'translate-y-20 opacity-0'
        )}
      >
        <div className="space-y-3 whitespace-pre-wrap">
          <AnimatePresence>
            {messages.map((message: ReceivedChatMessage) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 1, height: 'auto', translateY: 0.001 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              >
                <ChatEntry hideName key={message.id} entry={message} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </ChatMessageView>

      <div className="bg-background mp-12 fixed top-0 right-0 left-0 h-32 md:h-36">
        {/* skrim */}
        <div className="from-background absolute bottom-0 left-0 h-12 w-full translate-y-full bg-gradient-to-b to-transparent" />
      </div>

      <MediaTiles chatOpen={chatOpen} />

      <div className="bg-background fixed right-0 bottom-0 left-0 z-50 px-3 pt-2 pb-3 md:px-12 md:pb-12">
        <motion.div
          key="control-bar"
          initial={{ opacity: 0, translateY: '100%' }}
          animate={{
            opacity: sessionStarted ? 1 : 0,
            translateY: sessionStarted ? '0%' : '100%',
          }}
          transition={{ duration: 0.3, delay: sessionStarted ? 0.5 : 0, ease: 'easeOut' }}
        >
          <div className="relative z-10 mx-auto w-full max-w-2xl">
            {appConfig.isPreConnectBufferEnabled && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{
                  opacity: sessionStarted && messages.length === 0 ? 1 : 0,
                  transition: {
                    ease: 'easeIn',
                    delay: messages.length > 0 ? 0 : 0.8,
                    duration: messages.length > 0 ? 0.2 : 0.5,
                  },
                }}
                aria-hidden={messages.length > 0}
                className={cn(
                  'absolute inset-x-0 -top-12 text-center',
                  sessionStarted && messages.length === 0 && 'pointer-events-none'
                )}
              >
                <p className="animate-text-shimmer inline-block !bg-clip-text text-sm font-semibold text-transparent">
                  Agent is listening, ask it a question
                </p>
              </motion.div>
            )}

            <AgentControlBar
              capabilities={capabilities}
              onChatOpenChange={setChatOpen}
              onSendMessage={handleSendMessage}
              onDisconnect={handleDisconnect}
            />
          </div>
          {/* skrim */}
          <div className="from-background border-background absolute top-0 left-0 h-12 w-full -translate-y-full bg-gradient-to-t to-transparent" />
        </motion.div>
      </div>
    </section>
  );
};
