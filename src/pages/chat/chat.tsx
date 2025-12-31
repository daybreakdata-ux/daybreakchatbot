import { ChatInput } from "@/components/custom/chatinput";
import { PreviewMessage, ThinkingMessage } from "../../components/custom/message";
import { useScrollToBottom } from '@/components/custom/use-scroll-to-bottom';
import { useState, useRef } from "react";
import { fetchOpenRouterResponse } from "../../lib/openrouter";
import { message } from "../../interfaces/interfaces"

import { Header } from "@/components/custom/header";
import {v4 as uuidv4} from 'uuid';

//const socket = new WebSocket("ws://localhost:8090"); //change to your websocket endpoint

// get the device (instance)'s websocket endpoint
const proto = window.location.protocol === "https:" ? "wss" : "ws";
const host = window.location.hostname;
const socket = new WebSocket(`${proto}://${host}:8090`);

export function Chat() {
  const [messagesContainerRef, messagesEndRef] = useScrollToBottom<HTMLDivElement>();
  const [messages, setMessages] = useState<message[]>([]);
  const [question, setQuestion] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const messageHandlerRef = useRef<((event: MessageEvent) => void) | null>(null);

  const cleanupMessageHandler = () => {
    if (messageHandlerRef.current && socket) {
      socket.removeEventListener("message", messageHandlerRef.current);
      messageHandlerRef.current = null;
    }
  };

async function handleSubmit(text?: string) {
  if (isLoading) return;
  const messageText = text || question;
  if (!messageText) return;
  setIsLoading(true);
  setQuestion("");
  const traceId = uuidv4();
  setMessages(prev => [...prev, { content: messageText, role: "user", id: traceId }]);

  // Try OpenRouter API if API key is set, else fallback to WebSocket
  const apiKey = localStorage.getItem("openrouter_api_key") || "";
  if (apiKey) {
    try {
      const assistantContent = await fetchOpenRouterResponse([
        ...messages.map(({role, content}) => ({role, content})),
        { role: "user", content: messageText }
      ], apiKey);
      setMessages(prev => [...prev, { content: assistantContent, role: "assistant", id: uuidv4() }]);
    } catch (error) {
      setMessages(prev => [...prev, { content: "[OpenRouter API error]", role: "assistant", id: uuidv4() }]);
    }
    setIsLoading(false);
    return;
  }

  // Fallback: WebSocket
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    setIsLoading(false);
    setMessages(prev => [...prev, { content: "[WebSocket not connected]", role: "assistant", id: uuidv4() }]);
    return;
  }
  cleanupMessageHandler();
  socket.send(messageText);
  try {
    const messageHandler = (event: MessageEvent) => {
      setIsLoading(false);
      if(event.data.includes("[END]")) {
        return;
      }
      setMessages(prev => {
        const lastMessage = prev[prev.length - 1];
        const newContent = lastMessage?.role === "assistant" 
          ? lastMessage.content + event.data 
          : event.data;
        const newMessage = { content: newContent, role: "assistant", id: traceId };
        return lastMessage?.role === "assistant"
          ? [...prev.slice(0, -1), newMessage]
          : [...prev, newMessage];
      });
      if (event.data.includes("[END]")) {
        cleanupMessageHandler();
      }
    };
    messageHandlerRef.current = messageHandler;
    socket.addEventListener("message", messageHandler);
  } catch (error) {
    setIsLoading(false);
    setMessages(prev => [...prev, { content: "[WebSocket error]", role: "assistant", id: uuidv4() }]);
  }
}

  return (
    <div className="flex flex-col min-w-0 h-dvh bg-background">
      <Header/>
      <div className="flex flex-col min-w-0 gap-6 flex-1 overflow-y-scroll pt-4" ref={messagesContainerRef}>
        {/* Removed Overview (welcome message and credits) */}
        {messages.map((message, index) => (
          <PreviewMessage key={index} message={message} />
        ))}
        {isLoading && <ThinkingMessage />}
        <div ref={messagesEndRef} className="shrink-0 min-w-[24px] min-h-[24px]"/>
      </div>
      <div className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
        <ChatInput  
          question={question}
          setQuestion={setQuestion}
          onSubmit={handleSubmit}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
};
