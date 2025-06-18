"use client"

import { Upload, FileText, Image, File, CheckCircle, AlertCircle, Loader2, PencilLine, Images, LayoutGrid, SquarePlay, PanelLeft, Shell, ChevronDown} from "lucide-react"
import React, { useState, useEffect, useRef } from "react"
import { useUser, UserButton } from '@clerk/nextjs'
import { useChat } from 'ai/react'
import GPTIcon from "@/public/GPTIcon.svg"
import MarkdownRenderer from "@/components/MarkdownRenderer"
import { ContextWindowManager, getModelConfig } from "@/lib/context-window"
import { MemoryClient } from "@/lib/memory-client"
import {
  Plus,
  Search,
  Sparkles,
  Menu,
  X,
  Copy,
  ThumbsUp,
  ThumbsDown,
  VolumeX,
  Edit,
  RefreshCw,
  Share,
  MoreHorizontal,
  Info,
  LogIn,
  Trash2,
  Send,
  Mic,
  Settings
} from "lucide-react"
import Link from "next/link"

interface Message {
  id: string
  content: string
  role: "user" | "assistant"
  timestamp: Date
  type?: "text" | "file"
  file?: {
    url: string
    name: string
    fileType: string
    size?: number
    extractedText?: string
  }
}

interface Chat {
  id: string
  title: string
  lastMessage: string
  timestamp: Date
  messageCount: number
  isActive?: boolean
  userId?: string
}

export default function EnhancedChatInterface() {
  const { user, isLoaded } = useUser()
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [chats, setChats] = useState<Chat[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string>("")
  const [dragOver, setDragOver] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [filePreviewUrls, setFilePreviewUrls] = useState<string[]>([])
  const [processedFiles, setProcessedFiles] = useState<any[]>([])
  const [isProcessingFiles, setIsProcessingFiles] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  
  // New states for model management and loading optimization
  const [availableModels, setAvailableModels] = useState<any[]>([])
  const [selectedModel, setSelectedModel] = useState('gpt-4o')
  const [isSidebarLoading, setIsSidebarLoading] = useState(false)
  const [isChatsLoaded, setIsChatsLoaded] = useState(false)
  const [modelsLoaded, setModelsLoaded] = useState(false)
  const [contextInfo, setContextInfo] = useState<{ modelId: string; contextWindow: number; reserveTokens: number } | null>(null)
  
  // New states for message editing
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editedContent, setEditedContent] = useState('')
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null)
  
  // Memory service
  const [memoryService] = useState(() => new MemoryClient())
  const [relevantMemories, setRelevantMemories] = useState<any[]>([])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const editTextareaRef = useRef<HTMLTextAreaElement>(null)

  // Enhanced chat hook with Vercel AI SDK
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    stop,
    reload,
    setMessages,
    setInput
  } = useChat({
    api: '/api/chat',
    body: {
      chatId: activeChatId,
      fileData: processedFiles.length > 0 ? processedFiles[0] : null,
      model: selectedModel,
      relevantMemories: relevantMemories
    },
    onError: (error) => {
      console.error('Chat error:', error)
      setError('Failed to send message: ' + error.message)
      setIsRegenerating(false)
      setStreamingMessageId(null)
    },
    onFinish: async (message) => {
      // Clear attached files after successful send
      if (attachedFiles.length > 0) {
        clearAttachedFiles()
      }
      // Clear regeneration state
      setIsRegenerating(false)
      setStreamingMessageId(null)
      
      // Store conversation in memory
      if (user?.id && activeChatId && messages.length > 0) {
        try {
          const lastUserMessage = messages.findLast(m => m.role === 'user')
          if (lastUserMessage) {
            await memoryService.addMemory(
              `User: ${lastUserMessage.content}\nAssistant: ${message.content}`,
              { 
                userId: user.id, 
                chatId: activeChatId,
                sessionId: `chat_${activeChatId}`
              },
              {
                model: selectedModel,
                timestamp: new Date().toISOString(),
                messageCount: messages.length + 1
              }
            )
          }
        } catch (error) {
          console.warn('Failed to store memory:', error)
        }
      }
      
      // Refresh chat list to update lastMessage
      loadUserChats()
    }
  })

  // Message editing functions
  const startEditingMessage = (messageId: string, content: string) => {
    setEditingMessageId(messageId)
    setEditedContent(content)
    setError(null)
  }

  const cancelEditing = () => {
    setEditingMessageId(null)
    setEditedContent('')
  }

  const saveEditedMessage = async () => {
    if (!editingMessageId || !editedContent.trim()) return

    try {
      // Find the message index
      const messageIndex = messages.findIndex(msg => msg.id === editingMessageId)
      if (messageIndex === -1) return

      // Update the message content
      const updatedMessages = [...messages]
      updatedMessages[messageIndex] = {
        ...updatedMessages[messageIndex],
        content: editedContent.trim()
      }

      // Remove all messages after the edited one (they'll be regenerated)
      const messagesToKeep = updatedMessages.slice(0, messageIndex + 1)
      setMessages(messagesToKeep)

      // Clear editing state
      setEditingMessageId(null)
      setEditedContent('')

      // If this was a user message, trigger regeneration of assistant response
      if (messages[messageIndex].role === 'user') {
        await regenerateFromMessage(messageIndex, messagesToKeep)
      }

    } catch (error) {
      console.error('Error saving edited message:', error)
      setError('Failed to save message edit')
    }
  }

  const regenerateFromMessage = async (fromIndex: number, messagesToUse?: typeof messages) => {
    if (isLoading || isRegenerating) return

    try {
      setIsRegenerating(true)
      setError(null)
      
      const baseMessages = messagesToUse || messages
      const messagesToSend = baseMessages.slice(0, fromIndex + 1)
      
      // Remove any assistant messages after the user message
      const cleanMessages = messagesToSend.filter((msg, idx) => 
        idx <= fromIndex && (msg.role === 'user' || idx < fromIndex)
      )
      
      setMessages(cleanMessages)
      
      // Make API call to regenerate
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: cleanMessages.map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          chatId: activeChatId,
          model: selectedModel,
          fileData: processedFiles.length > 0 ? processedFiles[0] : null
        })
      })

      if (!response.ok) {
        throw new Error('Failed to regenerate response')
      }

      // Handle streaming response
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response stream')

      let assistantMessage = { id: Date.now().toString(), role: 'assistant' as const, content: '' }
      setStreamingMessageId(assistantMessage.id)
      setMessages([...cleanMessages, assistantMessage])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = new TextDecoder().decode(value)
        const lines = chunk.split('\n').filter(line => line.trim())
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue
            
            try {
              const parsed = JSON.parse(data)
              if (parsed.choices?.[0]?.delta?.content) {
                assistantMessage.content += parsed.choices[0].delta.content
                setMessages([...cleanMessages, { ...assistantMessage }])
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }

    } catch (error) {
      console.error('Error regenerating response:', error)
      setError('Failed to regenerate response')
    } finally {
      setIsRegenerating(false)
      setStreamingMessageId(null)
    }
  }

  const deleteMessage = (messageId: string) => {
    const messageIndex = messages.findIndex(msg => msg.id === messageId)
    if (messageIndex === -1) return

    // Remove this message and all messages after it
    const updatedMessages = messages.slice(0, messageIndex)
    setMessages(updatedMessages)
  }

  // Memory-enhanced input handling
  const handleMemoryEnhancedSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    
    if (!input.trim() || isLoading || isRegenerating) return
    
    // Search for relevant memories
    if (user?.id && input.trim().length > 10) {
      try {
        const memories = await memoryService.searchMemories(
          input.trim(),
          { userId: user.id, sessionId: activeChatId ? `chat_${activeChatId}` : undefined },
          3 // limit to top 3 relevant memories
        )
        setRelevantMemories(memories)
      } catch (error) {
        console.warn('Memory search failed:', error)
        setRelevantMemories([])
      }
    }
    
    // Continue with normal submit
    handleSubmit(e)
  }

  // Mobile detection and responsive handling
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 1024) // Changed from 768 to 1024 for better tablet experience
      // Auto-close sidebar on mobile
      if (window.innerWidth < 1024) {
        setIsSidebarOpen(false)
      } else {
        setIsSidebarOpen(true) // Auto-open on desktop
      }
    }
    
    checkIsMobile()
    window.addEventListener('resize', checkIsMobile)
    return () => window.removeEventListener('resize', checkIsMobile)
  }, [])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // Focus edit textarea when editing starts
  useEffect(() => {
    if (editingMessageId && editTextareaRef.current) {
      editTextareaRef.current.focus()
      editTextareaRef.current.setSelectionRange(editTextareaRef.current.value.length, editTextareaRef.current.value.length)
    }
  }, [editingMessageId])

  // Context window management
  useEffect(() => {
    const modelConfig = getModelConfig(selectedModel)
    setContextInfo({
      modelId: modelConfig.id,
      contextWindow: modelConfig.contextWindow,
      reserveTokens: modelConfig.reserveTokens || 4000
    })
  }, [selectedModel])

  // Initialize available models
  useEffect(() => {
    const initializeModels = () => {
      const fallbackModels = [
        {
          id: 'gpt-4o',
          name: 'GPT-4o',
          description: 'Most capable model, great for complex tasks',
          category: 'premium',
          icon: 'sparkles',
          capabilities: ['text', 'vision', 'function_calling'],
          contextWindow: 128000,
          pricing: 'premium'
        },
        {
          id: 'gpt-4o-mini',
          name: 'GPT-4o Mini',
          description: 'Faster and more affordable, great for most tasks',
          category: 'standard',
          icon: 'zap',
          capabilities: ['text', 'vision', 'function_calling'],
          contextWindow: 128000,
          pricing: 'standard'
        },
        {
          id: 'gpt-4-turbo',
          name: 'GPT-4 Turbo',
          description: 'High performance model with large context window',
          category: 'premium',
          icon: 'cpu',
          capabilities: ['text', 'vision', 'function_calling'],
          contextWindow: 128000,
          pricing: 'premium'
        },
        {
          id: 'gpt-3.5-turbo',
          name: 'GPT-3.5 Turbo',
          description: 'Fast and efficient for everyday tasks',
          category: 'standard',
          icon: 'shell',
          capabilities: ['text', 'function_calling'],
          contextWindow: 16385,
          pricing: 'budget'
        }
      ]
      setAvailableModels(fallbackModels)
      setModelsLoaded(true)
    }

    initializeModels()
  }, [])

  // Load user chats
  useEffect(() => {
    if (user && !isChatsLoaded) {
      loadUserChats()
    }
  }, [user, isChatsLoaded])

  // Load selected model from localStorage
  useEffect(() => {
    const savedModel = localStorage.getItem('selectedModel')
    if (savedModel && availableModels.some(m => m.id === savedModel)) {
      setSelectedModel(savedModel)
    }
  }, [availableModels])

  const loadUserChats = async () => {
    if (!user) return
    
    try {
      setIsSidebarLoading(true)
      const response = await fetch('/api/chats', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        if (response.status === 401) {
          setError('Authentication failed. Please refresh the page.')
          return
        }
        throw new Error(`Failed to load chats: ${response.status}`)
      }

      const chatsData = await response.json()
      setChats(chatsData || [])
      setError(null)
      setIsChatsLoaded(true)
    } catch (error) {
      console.error('Error loading chats:', error)
      setError('Failed to load chat history')
    } finally {
      setIsSidebarLoading(false)
    }
  }

  const createNewChat = async () => {
    if (!user) return

    try {
      const response = await fetch('/api/chats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'New Chat',
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to create chat: ${response.status}`)
      }

      const newChat = await response.json()
      
      setChats(prev => [newChat, ...prev])
      setMessages([])
      setActiveChatId(newChat.id)
      setError(null)
      
      // Close sidebar on mobile after creating chat
      if (isMobile) {
        setIsSidebarOpen(false)
      }
    } catch (error) {
      console.error('Error creating new chat:', error)
      setError('Failed to create chat')
    }
  }

  const selectChat = async (chatId: string) => {
    if (isLoading) return
    
    setActiveChatId(chatId)
    
    // Close sidebar on mobile after selecting chat
    if (isMobile) {
      setIsSidebarOpen(false)
    }
    
    try {
      const response = await fetch(`/api/chats/${chatId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
      if (response.ok) {
        const chat = await response.json()
        // Convert chat messages to the format expected by useChat
        const chatMessages = (chat.messages || []).map((msg: any) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          createdAt: new Date(msg.timestamp)
        }))
        setMessages(chatMessages)
      }
    } catch (error) {
      console.error('Error loading chat messages:', error)
      setError('Failed to load messages')
    }
  }

  const deleteChat = async (chatId: string) => {
    try {
      const originalChats = [...chats]
      setChats(chats.filter(chat => chat.id !== chatId))
      
      if (activeChatId === chatId) {
        setMessages([])
        setActiveChatId(null)
      }

      const response = await fetch(`/api/chats/${chatId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        setChats(originalChats)
        throw new Error(`Failed to delete chat: ${response.status}`)
      }
    } catch (error) {
      console.error('Error deleting chat:', error)
      setError('Failed to delete chat. Please try again.')
    }
  }

  // File handling functions (same as before but with accessibility improvements)
  const validateFile = (file: File): string | null => {
    const maxSize = file.type.startsWith('image/') ? 10 * 1024 * 1024 : 100 * 1024 * 1024
    
    if (file.size > maxSize) {
      return `File too large. Maximum size is ${file.type.startsWith('image/') ? '10MB for images' : '100MB for documents'}.`
    }

    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml',
      'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain', 'text/csv', 'text/html', 'text/css', 'text/javascript', 'text/markdown',
      'application/json', 'application/xml', 'text/xml',
    ]

    const fileExtension = file.name.toLowerCase().split('.').pop()
    const allowedExtensions = [
      'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg',
      'pdf', 'doc', 'docx', 'txt', 'csv', 'html', 'css', 'js', 'ts', 'md', 'json', 'xml'
    ]

    const isValidType = allowedTypes.some(type => file.type.includes(type)) || 
                       allowedExtensions.includes(fileExtension || '')

    if (!isValidType) {
      return 'File type not supported. Supported: images, PDFs, Office docs, text files.'
    }

    return null
  }

  const processFileImmediately = async (file: File) => {
    try {
      setIsProcessingFiles(true)
      setUploadProgress(`Processing ${file.name}...`)
      
      console.log('Starting file processing for:', file.name, file.type, file.size)

      const formData = new FormData()
      formData.append('file', file)
      formData.append('extractText', 'true')
      formData.append('analyzeContent', 'true')
      
      if (file.type.startsWith('image/')) {
        formData.append('prompt', 'Please analyze this image and describe what you see in detail.')
      }

      console.log('Sending request to /api/file-process...')
      setUploadProgress(`Uploading ${file.name}...`)
      
      const response = await fetch('/api/file-process', {
        method: 'POST',
        body: formData,
      })

      console.log('Response status:', response.status)
      
      if (!response.ok) {
        const errorData = await response.text()
        console.error('API Error Response:', errorData)
        
        if (response.status === 401) {
          throw new Error('Authentication failed. Please sign in again.')
        } else if (response.status === 413) {
          throw new Error('File too large. Please try a smaller file.')
        } else {
          throw new Error(`Processing failed: ${response.status} - ${errorData}`)
        }
      }

      setUploadProgress(`Analyzing ${file.name}...`)
      const result = await response.json()
      console.log('Processing result:', result)
      
      if (!result.success) {
        throw new Error(result.error || 'Processing failed')
      }
      
      const processedFile = {
        ...result,
        originalFile: file,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size
      }
      
      setProcessedFiles([processedFile])
      setUploadProgress(`✓ ${file.name} ready! ${result.extractedText ? 'Text extracted.' : ''} ${result.analysis ? 'Analysis complete.' : ''}`)
      
      setTimeout(() => setUploadProgress(""), 3000)
      return processedFile

    } catch (error) {
      console.error('File processing error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setError(`Failed to process ${file.name}: ${errorMessage}`)
      setUploadProgress('')
      return null
    } finally {
      setIsProcessingFiles(false)
    }
  }

  const handleFileAttachment = async (files: FileList | File[]) => {
    const file = Array.from(files)[0] // Only handle one file for now
    if (!file) {
      console.log('No file provided to handleFileAttachment')
      return
    }

    console.log('File attached:', file.name, file.type, file.size)

    const validationError = validateFile(file)
    if (validationError) {
      console.error('File validation error:', validationError)
      setError(validationError)
      return
    }

    console.log('File validation passed, setting attached files...')
    setAttachedFiles([file])
    
    if (file.type.startsWith('image/')) {
      const previewUrl = URL.createObjectURL(file)
      setFilePreviewUrls([previewUrl])
      console.log('Image preview URL created:', previewUrl)
    } else {
      setFilePreviewUrls([''])
    }

    console.log('Starting immediate file processing...')
    await processFileImmediately(file)
  }

  const clearAttachedFiles = () => {
    filePreviewUrls.forEach(url => {
      if (url) URL.revokeObjectURL(url)
    })
    
    setAttachedFiles([])
    setFilePreviewUrls([])
    setProcessedFiles([])
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileAttachment(e.dataTransfer.files)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getFileIcon = (fileType: string, fileName?: string) => {
    const extension = fileName?.toLowerCase().split('.').pop() || ''
    
    if (fileType.startsWith('image/')) return <Image className="h-4 w-4" />
    if (fileType.includes('pdf') || extension === 'pdf') return <FileText className="h-4 w-4" />
    return <File className="h-4 w-4" />
  }

  // Enhanced submit handler with memory integration
  const handleEnhancedSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    
    if (!activeChatId && input.trim()) {
      // Create new chat first
      await createNewChat()
    }
    
    if (activeChatId) {
      // Use memory-enhanced submit
      await handleMemoryEnhancedSubmit(e)
    }
  }

  if (!isLoaded) {
    return (
      <div className="flex h-screen bg-[#212121] text-white items-center justify-center">
        <div className="text-center" role="status" aria-label="Loading application">
          <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#acacac]">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex h-screen bg-[#212121] text-white items-center justify-center p-4">
        <div className="text-center max-w-md mx-auto">
          <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-6">
            AI
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-4">Welcome to ChatGPT Clone</h1>
          <p className="text-[#acacac] mb-8">Sign in to start chatting with AI and save your conversations.</p>
          <div className="space-y-4">
            <Link href="/sign-in">
              <button className="w-full bg-white text-black hover:bg-gray-100 gap-2 flex items-center justify-center px-4 py-3 rounded-md font-medium">
                <LogIn className="h-4 w-4" />
                Sign In
              </button>
            </Link>
            <Link href="/sign-up">
              <button className="w-full border border-[#2f2f2f] text-white hover:bg-[#2f2f2f] px-4 py-3 rounded-md font-medium">
                Create Account
              </button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-[#212121] text-white overflow-hidden">
      {/* Mobile Backdrop */}
      {isMobile && isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`${
          isSidebarOpen ? "w-64" : "w-0"
        } ${
          isMobile ? "fixed left-0 top-0 h-full z-50" : "relative"
        } transition-all duration-300 overflow-hidden bg-[#171717] flex flex-col lg:w-64 lg:static lg:translate-x-0`}
        aria-label="Chat navigation"
      >
        {/* Sidebar Header */}
        <div className="p-2">
          <button
            className="w-full flex items-center gap-3 text-white hover:bg-[#212121] h-11 px-3 rounded-lg text-sm font-medium transition-colors"
            onClick={createNewChat}
            disabled={isLoading}
            aria-label="Create new chat"
          >
            <PencilLine className="h-4 w-4" />
            New chat
          </button>
        </div>

        {/* Sidebar Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 pb-2" role="navigation" aria-label="Chat functions">
          {/* Chat List */}
          {isSidebarLoading ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-2">
              <div className="w-6 h-6 border-2 border-[#8e8ea0] border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm text-[#8e8ea0]">Loading chats...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-sm text-red-400">{error}</p>
              <button 
                onClick={loadUserChats}
                className="text-sm text-[#10a37f] hover:underline"
              >
                Retry
              </button>
            </div>
          ) : chats.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-sm text-[#8e8ea0]">No chats yet</p>
              <button 
                onClick={createNewChat}
                className="text-sm text-[#10a37f] hover:underline"
              >
                Create your first chat
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              {/* Group chats by time */}
              {(() => {
                const now = new Date()
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
                const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
                const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
                const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)

                const todayChats = chats.filter(chat => new Date(chat.timestamp) >= today)
                const yesterdayChats = chats.filter(chat => {
                  const chatDate = new Date(chat.timestamp)
                  return chatDate >= yesterday && chatDate < today
                })
                const week7Chats = chats.filter(chat => {
                  const chatDate = new Date(chat.timestamp)
                  return chatDate >= weekAgo && chatDate < yesterday
                })
                const month30Chats = chats.filter(chat => {
                  const chatDate = new Date(chat.timestamp)
                  return chatDate >= monthAgo && chatDate < weekAgo
                })
                const olderChats = chats.filter(chat => new Date(chat.timestamp) < monthAgo)

                return (
                  <>
                    {todayChats.length > 0 && (
                      <div className="mb-4">
                        <h3 className="text-xs font-medium text-[#8e8ea0] px-3 py-2 sticky top-0 bg-[#171717]">
                          Today
                        </h3>
                        <div className="space-y-0">
                          {todayChats.map((chat) => (
                            <div key={chat.id} className="group relative">
                              <button
                                className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors flex items-center gap-3 ${
                                  activeChatId === chat.id 
                                    ? "bg-[#212121] text-white" 
                                    : "text-[#ececec] hover:bg-[#212121]"
                                }`}
                                onClick={() => selectChat(chat.id)}
                                aria-label={`Open chat: ${chat.title}`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="truncate font-normal">{chat.title}</div>
                                </div>
                              </button>
                              <button
                                className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 opacity-0 group-hover:opacity-100 text-[#8e8ea0] hover:text-white transition-all duration-150 rounded flex items-center justify-center hover:bg-[#2f2f2f]"
                                onClick={async (e) => {
                                  e.stopPropagation()
                                  if (confirm('Are you sure you want to delete this chat?')) {
                                    await deleteChat(chat.id)
                                  }
                                }}
                                aria-label={`Delete chat: ${chat.title}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {yesterdayChats.length > 0 && (
                      <div className="mb-4">
                        <h3 className="text-xs font-medium text-[#8e8ea0] px-3 py-2 sticky top-0 bg-[#171717]">
                          Yesterday
                        </h3>
                        <div className="space-y-0">
                          {yesterdayChats.map((chat) => (
                            <div key={chat.id} className="group relative">
                              <button
                                className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors flex items-center gap-3 ${
                                  activeChatId === chat.id 
                                    ? "bg-[#212121] text-white" 
                                    : "text-[#ececec] hover:bg-[#212121]"
                                }`}
                                onClick={() => selectChat(chat.id)}
                                aria-label={`Open chat: ${chat.title}`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="truncate font-normal">{chat.title}</div>
                                </div>
                              </button>
                              <button
                                className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 opacity-0 group-hover:opacity-100 text-[#8e8ea0] hover:text-white transition-all duration-150 rounded flex items-center justify-center hover:bg-[#2f2f2f]"
                                onClick={async (e) => {
                                  e.stopPropagation()
                                  if (confirm('Are you sure you want to delete this chat?')) {
                                    await deleteChat(chat.id)
                                  }
                                }}
                                aria-label={`Delete chat: ${chat.title}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {week7Chats.length > 0 && (
                      <div className="mb-4">
                        <h3 className="text-xs font-medium text-[#8e8ea0] px-3 py-2 sticky top-0 bg-[#171717]">
                          Previous 7 Days
                        </h3>
                        <div className="space-y-0">
                          {week7Chats.map((chat) => (
                            <div key={chat.id} className="group relative">
                              <button
                                className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors flex items-center gap-3 ${
                                  activeChatId === chat.id 
                                    ? "bg-[#212121] text-white" 
                                    : "text-[#ececec] hover:bg-[#212121]"
                                }`}
                                onClick={() => selectChat(chat.id)}
                                aria-label={`Open chat: ${chat.title}`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="truncate font-normal">{chat.title}</div>
                                </div>
                              </button>
                              <button
                                className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 opacity-0 group-hover:opacity-100 text-[#8e8ea0] hover:text-white transition-all duration-150 rounded flex items-center justify-center hover:bg-[#2f2f2f]"
                                onClick={async (e) => {
                                  e.stopPropagation()
                                  if (confirm('Are you sure you want to delete this chat?')) {
                                    await deleteChat(chat.id)
                                  }
                                }}
                                aria-label={`Delete chat: ${chat.title}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {month30Chats.length > 0 && (
                      <div className="mb-4">
                        <h3 className="text-xs font-medium text-[#8e8ea0] px-3 py-2 sticky top-0 bg-[#171717]">
                          Previous 30 Days
                        </h3>
                        <div className="space-y-0">
                          {month30Chats.map((chat) => (
                            <div key={chat.id} className="group relative">
                              <button
                                className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors flex items-center gap-3 ${
                                  activeChatId === chat.id 
                                    ? "bg-[#212121] text-white" 
                                    : "text-[#ececec] hover:bg-[#212121]"
                                }`}
                                onClick={() => selectChat(chat.id)}
                                aria-label={`Open chat: ${chat.title}`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="truncate font-normal">{chat.title}</div>
                                </div>
                              </button>
                              <button
                                className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 opacity-0 group-hover:opacity-100 text-[#8e8ea0] hover:text-white transition-all duration-150 rounded flex items-center justify-center hover:bg-[#2f2f2f]"
                                onClick={async (e) => {
                                  e.stopPropagation()
                                  if (confirm('Are you sure you want to delete this chat?')) {
                                    await deleteChat(chat.id)
                                  }
                                }}
                                aria-label={`Delete chat: ${chat.title}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {olderChats.length > 0 && (
                      <div className="mb-4">
                        <h3 className="text-xs font-medium text-[#8e8ea0] px-3 py-2 sticky top-0 bg-[#171717]">
                          Older
                        </h3>
                        <div className="space-y-0">
                          {olderChats.map((chat) => (
                            <div key={chat.id} className="group relative">
                              <button
                                className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors flex items-center gap-3 ${
                                  activeChatId === chat.id 
                                    ? "bg-[#212121] text-white" 
                                    : "text-[#ececec] hover:bg-[#212121]"
                                }`}
                                onClick={() => selectChat(chat.id)}
                                aria-label={`Open chat: ${chat.title}`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="truncate font-normal">{chat.title}</div>
                                </div>
                              </button>
                              <button
                                className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 opacity-0 group-hover:opacity-100 text-[#8e8ea0] hover:text-white transition-all duration-150 rounded flex items-center justify-center hover:bg-[#2f2f2f]"
                                onClick={async (e) => {
                                  e.stopPropagation()
                                  if (confirm('Are you sure you want to delete this chat?')) {
                                    await deleteChat(chat.id)
                                  }
                                }}
                                aria-label={`Delete chat: ${chat.title}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          )}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-2 border-t border-[#2f2f2f] space-y-1">
          <button className="w-full flex items-center gap-3 text-[#ececec] hover:bg-[#212121] h-11 px-3 rounded-lg text-sm transition-colors">
            <Settings className="h-4 w-4" />
            Settings
          </button>
          
          <div className="flex items-center gap-3 px-3 py-2">
            <UserButton 
              appearance={{
                elements: {
                  avatarBox: "w-6 h-6"
                }
              }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#ececec] truncate">
                {user?.firstName || user?.emailAddresses[0]?.emailAddress}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between p-3 sm:p-4 border-b border-[#2f2f2f] bg-[#212121]">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <button
              className="text-white hover:bg-[#2f2f2f] p-1.5 sm:p-2 rounded-md flex-shrink-0"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              aria-label="Toggle sidebar"
            >
              <Menu className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>

            {/* Model Selector */}
            <div className="relative min-w-0 flex-1 max-w-xs">
              <button
                className="flex items-center gap-1 sm:gap-2 text-white hover:bg-[#2f2f2f] px-2 sm:px-3 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium min-w-0 max-w-full"
                onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                aria-expanded={isModelDropdownOpen}
                aria-haspopup="listbox"
                aria-label="Select AI model"
              >
                <span className="truncate">
                  {isMobile 
                    ? (availableModels.find(m => m.id === selectedModel)?.name?.split(' ')[0] || 'GPT')
                    : (availableModels.find(m => m.id === selectedModel)?.name || selectedModel)
                  }
                </span>
                <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
              </button>

              {isModelDropdownOpen && (
                <div 
                  className="absolute top-full left-0 mt-1 w-56 sm:w-64 bg-[#2f2f2f] border border-[#404040] rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto"
                  role="listbox"
                  aria-label="Available models"
                >
                  {availableModels.map((model) => (
                    <button
                      key={model.id}
                      className={`w-full text-left px-4 py-3 hover:bg-[#404040] transition-colors ${
                        selectedModel === model.id ? 'bg-[#404040]' : ''
                      }`}
                      onClick={() => {
                        setSelectedModel(model.id)
                        setIsModelDropdownOpen(false)
                        localStorage.setItem('selectedModel', model.id)
                      }}
                      role="option"
                      aria-selected={selectedModel === model.id}
                    >
                      <div className="font-medium text-white">{model.name}</div>
                      <div className="text-sm text-[#8e8ea0]">{model.description}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {/* Get Plus Button */}
            <button className="bg-white text-black px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium hover:bg-gray-100 transition-colors">
              <span className="hidden sm:inline">Get Plus</span>
              <span className="sm:hidden">Plus</span>
            </button>
            
            {/* User Profile */}
            <UserButton 
              appearance={{
                elements: {
                  avatarBox: "w-7 h-7 sm:w-8 sm:h-8",
                  userButtonTrigger: "hover:bg-[#2f2f2f] rounded-lg transition-colors p-0.5 sm:p-1",
                }
              }}
            />
          </div>
        </header>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full px-2 sm:px-4">
                <div className="text-center max-w-2xl w-full">
                  <h1 className="text-2xl sm:text-3xl lg:text-4xl font-medium mb-6 sm:mb-8 text-center">
                    How can I help you today?
                  </h1>
                  
                  {/* Conversation Starters */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 mb-6 sm:mb-8 max-w-2xl w-full">
                    <button
                      onClick={() => setInput("Help me write a professional email")}
                      className="p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-[#404040] hover:border-[#565656] bg-[#2f2f2f]/30 hover:bg-[#2f2f2f]/50 transition-all text-left group"
                    >
                      <div className="text-xs sm:text-sm font-medium mb-1">✍️ Write & Edit</div>
                      <div className="text-xs text-[#8e8ea0]">Help me write a professional email</div>
                    </button>
                    
                    <button
                      onClick={() => setInput("Explain quantum computing in simple terms")}
                      className="p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-[#404040] hover:border-[#565656] bg-[#2f2f2f]/30 hover:bg-[#2f2f2f]/50 transition-all text-left group"
                    >
                      <div className="text-xs sm:text-sm font-medium mb-1">🧠 Learn & Understand</div>
                      <div className="text-xs text-[#8e8ea0]">Explain quantum computing in simple terms</div>
                    </button>
                    
                    <button
                      onClick={() => setInput("Create a meal plan for the week")}
                      className="p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-[#404040] hover:border-[#565656] bg-[#2f2f2f]/30 hover:bg-[#2f2f2f]/50 transition-all text-left group"
                    >
                      <div className="text-xs sm:text-sm font-medium mb-1">📋 Plan & Organize</div>
                      <div className="text-xs text-[#8e8ea0]">Create a meal plan for the week</div>
                    </button>
                    
                    <button
                      onClick={() => setInput("Help me debug this JavaScript code")}
                      className="p-4 rounded-2xl border border-[#404040] hover:border-[#565656] bg-[#2f2f2f]/30 hover:bg-[#2f2f2f]/50 transition-all text-left group"
                    >
                      <div className="text-sm font-medium mb-1">💻 Code & Debug</div>
                      <div className="text-xs text-[#8e8ea0]">Help me debug this JavaScript code</div>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4" role="log" aria-label="Chat messages" aria-live="polite">
                {messages.map((message, index) => (
                  <div key={message.id || index} className="group">
                    {message.role === 'assistant' ? (
                      /* Assistant Message */
                      <div className="flex gap-2 sm:gap-4 mb-4 sm:mb-6">
                        <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-[#10a37f] flex items-center justify-center flex-shrink-0">
                          {streamingMessageId === message.id ? (
                            <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 text-white animate-spin" />
                          ) : (
                            <img src={GPTIcon.src} alt="ChatGPT" className="h-3 w-3 sm:h-4 sm:w-4" />
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          {editingMessageId === message.id ? (
                            // Editing mode
                            <div className="space-y-2 sm:space-y-3">
                              <textarea
                                ref={editTextareaRef}
                                value={editedContent}
                                onChange={(e) => setEditedContent(e.target.value)}
                                className="w-full min-h-[80px] sm:min-h-[100px] p-2 sm:p-3 bg-[#2f2f2f] text-white rounded-lg border border-[#404040] focus:border-[#10a37f] focus:outline-none resize-y text-sm sm:text-base"
                                placeholder="Edit your message..."
                                autoFocus
                              />
                              <div className="flex gap-2 justify-end">
                                <button
                                  onClick={cancelEditing}
                                  className="px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm text-[#8e8ea0] hover:text-white hover:bg-[#2f2f2f] rounded-md transition-colors"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={saveEditedMessage}
                                  disabled={!editedContent.trim()}
                                  className="px-3 py-1.5 text-sm bg-[#10a37f] text-white rounded-md hover:bg-[#0d8a6b] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                  Save & Regenerate
                                </button>
                              </div>
                            </div>
                          ) : (
                            // Display mode
                            <div className="prose prose-invert max-w-none">
                              <MarkdownRenderer content={message.content} />
                              {/* Streaming indicator */}
                              {streamingMessageId === message.id && message.content && (
                                <span className="inline-block w-2 h-4 bg-white opacity-75 animate-pulse ml-1"></span>
                              )}
                            </div>
                          )}
                          
                          {/* Message Actions - Below assistant messages */}
                          {!editingMessageId && (
                            <div className="flex items-center gap-2 mt-3 text-[#8e8ea0]">
                              <button
                                onClick={() => navigator.clipboard.writeText(message.content)}
                                className="h-7 w-7 hover:bg-[#2f2f2f] rounded-md flex items-center justify-center hover:text-white transition-colors"
                                aria-label="Copy message"
                                title="Copy"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                              <button
                                className="h-7 w-7 hover:bg-[#2f2f2f] rounded-md flex items-center justify-center hover:text-white transition-colors"
                                aria-label="Good response"
                                title="Good response"
                              >
                                <ThumbsUp className="h-3.5 w-3.5" />
                              </button>
                              <button
                                className="h-7 w-7 hover:bg-[#2f2f2f] rounded-md flex items-center justify-center hover:text-white transition-colors"
                                aria-label="Bad response"
                                title="Bad response"
                              >
                                <ThumbsDown className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => regenerateFromMessage(index - 1)}
                                disabled={isLoading || isRegenerating}
                                className="h-7 w-7 hover:bg-[#2f2f2f] rounded-md flex items-center justify-center hover:text-white transition-colors disabled:opacity-50"
                                aria-label="Regenerate response"
                                title="Regenerate"
                              >
                                <RefreshCw className={`h-3.5 w-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
                              </button>
                              <button
                                className="h-7 w-7 hover:bg-[#2f2f2f] rounded-md flex items-center justify-center hover:text-white transition-colors"
                                aria-label="Share"
                                title="Share"
                              >
                                <Share className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* User Message */
                      <div className="flex justify-end mb-6">
                        <div className="max-w-[80%] bg-[#2f2f2f] rounded-2xl px-4 py-3 relative group">
                          {editingMessageId === message.id ? (
                            // Editing mode
                            <div className="space-y-3">
                              <textarea
                                ref={editTextareaRef}
                                value={editedContent}
                                onChange={(e) => setEditedContent(e.target.value)}
                                className="w-full min-h-[100px] p-3 bg-[#404040] text-white rounded-lg border border-[#565656] focus:border-[#10a37f] focus:outline-none resize-y"
                                placeholder="Edit your message..."
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                    e.preventDefault()
                                    saveEditedMessage()
                                  } else if (e.key === 'Escape') {
                                    e.preventDefault()
                                    cancelEditing()
                                  }
                                }}
                              />
                              <div className="flex gap-2 justify-end">
                                <button
                                  onClick={cancelEditing}
                                  className="px-3 py-1.5 text-sm text-[#8e8ea0] hover:text-white hover:bg-[#404040] rounded-md transition-colors"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={saveEditedMessage}
                                  disabled={!editedContent.trim()}
                                  className="px-3 py-1.5 text-sm bg-[#10a37f] text-white rounded-md hover:bg-[#0d8a6b] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                  Save & Regenerate
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-white whitespace-pre-wrap">{message.content}</p>
                          )}
                          
                          {/* Message Actions */}
                          {!editingMessageId && (
                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => startEditingMessage(message.id, message.content)}
                                className="h-6 w-6 hover:bg-[#404040] rounded flex items-center justify-center text-[#8e8ea0] hover:text-white"
                                aria-label="Edit message"
                                title="Edit message"
                              >
                                <Edit className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => navigator.clipboard.writeText(message.content)}
                                className="h-6 w-6 hover:bg-[#404040] rounded flex items-center justify-center text-[#8e8ea0] hover:text-white"
                                aria-label="Copy message"
                                title="Copy message"
                              >
                                <Copy className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            
            {/* Enhanced Loading indicator */}
            {(isLoading || isRegenerating) && (
              <div className="flex gap-4 mb-6" aria-live="polite" aria-label="AI is responding">
                <div className="w-8 h-8 rounded-full bg-[#10a37f] flex items-center justify-center flex-shrink-0">
                  <Loader2 className="h-4 w-4 text-white animate-spin" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-[#8e8ea0] rounded-full animate-pulse"></div>
                    <div className="w-2 h-2 bg-[#8e8ea0] rounded-full animate-pulse delay-100"></div>
                    <div className="w-2 h-2 bg-[#8e8ea0] rounded-full animate-pulse delay-200"></div>
                  </div>
                </div>
                {(isLoading || isRegenerating) && (
                  <button
                    onClick={() => {
                      stop()
                      setIsRegenerating(false)
                      setStreamingMessageId(null)
                    }}
                    className="h-7 w-7 text-[#8e8ea0] hover:text-white hover:bg-[#2f2f2f] rounded-md flex items-center justify-center"
                    aria-label="Stop generation"
                    title="Stop generation"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}

            <div ref={messagesEndRef} className="h-0"></div>
          </div>
        </div>

        {/* Input Area */}
        <div className="p-3 sm:p-4 bg-[#212121]">
          <div className="max-w-3xl mx-auto">
            {/* Error Display */}
            {error && (
              <div className="mb-3 sm:mb-4 p-2 sm:p-3 bg-red-900/20 border border-red-500/30 rounded-lg" role="alert">
                <div className="flex items-center gap-2 sm:gap-3">
                  <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4 text-red-400 flex-shrink-0" />
                  <span className="text-xs sm:text-sm text-red-400 min-w-0 flex-1">{error}</span>
                  <button 
                    onClick={() => setError(null)}
                    className="text-red-400 hover:text-red-300 flex-shrink-0"
                    aria-label="Dismiss error"
                  >
                    <X className="h-3 w-3 sm:h-4 sm:w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Upload Progress */}
            {uploadProgress && (
              <div className="mb-3 sm:mb-4 p-2 sm:p-3 bg-[#2f2f2f] rounded-lg border border-[#404040]" role="status">
                <div className="flex items-center gap-2 sm:gap-3">
                  <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin text-[#10a37f] flex-shrink-0" />
                  <span className="text-xs sm:text-sm text-[#acacac] min-w-0 flex-1">{uploadProgress}</span>
                </div>
              </div>
            )}

            <form onSubmit={handleEnhancedSubmit}>
              <div 
                className={`relative bg-[#2f2f2f] rounded-3xl border transition-colors ${
                  dragOver 
                    ? 'border-[#10a37f] bg-[#10a37f]/10' 
                    : 'border-[#404040] focus-within:border-[#565656]'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {/* Drag Overlay */}
                {dragOver && (
                  <div className="absolute inset-0 bg-[#10a37f]/20 border-2 border-dashed border-[#10a37f] rounded-3xl flex items-center justify-center z-10">
                    <div className="text-center">
                      <Upload className="h-8 w-8 text-[#10a37f] mx-auto mb-2" />
                      <p className="text-[#10a37f] font-medium">Drop file to attach</p>
                      <p className="text-sm text-[#acacac]">Images, PDFs, Documents</p>
                    </div>
                  </div>
                )}

                {/* File Attachment Preview */}
                {attachedFiles.length > 0 && (
                  <div className="px-3 sm:px-4 pt-2 sm:pt-3">
                    <div className="flex items-center gap-2 bg-[#404040] rounded-lg p-2 sm:p-3">
                      <div className="flex-shrink-0 relative">
                        {attachedFiles[0].type.startsWith('image/') && filePreviewUrls[0] ? (
                          <img 
                            src={filePreviewUrls[0]} 
                            alt={attachedFiles[0].name}
                            className="w-8 h-8 sm:w-10 sm:h-10 object-cover rounded"
                          />
                        ) : (
                          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-[#2f2f2f] rounded flex items-center justify-center">
                            {getFileIcon(attachedFiles[0].type, attachedFiles[0].name)}
                          </div>
                        )}
                        {isProcessingFiles && (
                          <div className="absolute -top-1 -right-1">
                            <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                          </div>
                        )}
                        {processedFiles.length > 0 && !isProcessingFiles && (
                          <div className="absolute -top-1 -right-1">
                            <CheckCircle className="h-4 w-4 text-green-400" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate font-medium">{attachedFiles[0].name}</p>
                        <div className="text-xs text-[#8e8ea0] space-y-1">
                          <p>{formatFileSize(attachedFiles[0].size)}</p>
                          {isProcessingFiles && (
                            <p className="text-blue-400">Processing...</p>
                          )}
                          {processedFiles.length > 0 && !isProcessingFiles && (
                            <div className="space-y-1">
                              <p className="text-green-400">✓ Ready for chat</p>
                              {processedFiles[0].extractedText && (
                                <p className="text-green-400">✓ Text extracted ({processedFiles[0].extractedText.length} chars)</p>
                              )}
                              {processedFiles[0].analysis && (
                                <div className="space-y-1">
                                  <p className="text-green-400">✓ AI analysis complete</p>
                                  {processedFiles[0].metadata?.isImage && (
                                    <p className="text-xs text-[#8e8ea0] italic">
                                      "{processedFiles[0].analysis.substring(0, 100)}..."
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <button 
                        type="button"
                        onClick={clearAttachedFiles}
                        disabled={isProcessingFiles}
                        className="text-[#8e8ea0] hover:text-red-400 flex-shrink-0 p-1 rounded disabled:opacity-50"
                        aria-label="Remove file"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    
                    {/* Show processing error if any */}
                    {error && error.includes(attachedFiles[0].name) && (
                      <div className="mt-2 p-2 bg-red-900/20 border border-red-500/30 rounded text-xs text-red-400">
                        {error}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-end gap-1 sm:gap-2 p-2 sm:p-4">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-[#8e8ea0] hover:text-white hover:bg-[#404040] h-7 w-7 sm:h-8 sm:w-8 rounded-full flex items-center justify-center transition-colors flex-shrink-0"
                    aria-label="Attach file"
                  >
                    <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
                  </button>

                  <div className="flex-1 min-w-0">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={(e) => e.target.files && handleFileAttachment(e.target.files)}
                      accept="image/*,.pdf,.doc,.docx,.txt,.csv,.html,.css,.js,.ts,.md,.json,.xml"
                      className="hidden"
                      aria-label="Select file to upload"
                    />

                    <input
                      value={input}
                      onChange={handleInputChange}
                      placeholder="Message ChatGPT"
                      disabled={isLoading || isUploading}
                      className="w-full border-0 bg-transparent text-white placeholder-[#8e8ea0] focus:outline-none min-h-[20px] sm:min-h-[24px] text-sm sm:text-[16px] resize-none"
                      aria-label="Type your message"
                    />
                  </div>

                  <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                    {/* Tools Button - hide on mobile to save space */}
                    <button
                      type="button"
                      className="hidden sm:flex items-center gap-2 text-[#8e8ea0] hover:text-white hover:bg-[#404040] h-8 px-3 rounded-full text-sm transition-colors"
                      aria-label="Tools"
                    >
                      <Settings className="h-4 w-4" />
                      <span className="text-sm">Tools</span>
                    </button>

                    {isLoading && (
                      <button
                        type="button"
                        onClick={stop}
                        className="text-[#8e8ea0] hover:text-white hover:bg-[#404040] h-7 w-7 sm:h-8 sm:w-8 rounded-full flex items-center justify-center transition-colors"
                        aria-label="Stop generation"
                      >
                        <X className="h-3 w-3 sm:h-4 sm:w-4" />
                      </button>
                    )}

                    <button
                      type="button"
                      className="text-[#8e8ea0] hover:text-white hover:bg-[#404040] h-7 w-7 sm:h-8 sm:w-8 rounded-full flex items-center justify-center transition-colors"
                      aria-label="Voice input"
                    >
                      <Mic className="h-3 w-3 sm:h-4 sm:w-4" />
                    </button>

                    <button
                      type="submit"
                      disabled={
                        (!input.trim() && attachedFiles.length === 0) || 
                        isLoading || 
                        isUploading || 
                        isProcessingFiles
                      }
                      className="bg-white text-black hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed h-7 w-7 sm:h-8 sm:w-8 rounded-full flex items-center justify-center transition-colors"
                      aria-label="Send message"
                    >
                      <Send className="h-3 w-3 sm:h-4 sm:w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </form>

            <p className="text-xs text-[#8e8ea0] text-center mt-2 sm:mt-3 px-2">
              ChatGPT can make mistakes. Check important info. <button className="underline hover:no-underline">See Cookie Preferences</button>
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
