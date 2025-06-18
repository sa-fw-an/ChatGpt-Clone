"use client"

import { Upload, FileText, Image, File, CheckCircle, AlertCircle, Loader2, PencilLine, Images, LayoutGrid, SquarePlay, PanelLeft, Shell, ChevronDown} from "lucide-react"
import React, { useState, useEffect, useRef } from "react"
import { useUser, UserButton } from '@clerk/nextjs'
import GPTIcon from "@/public/GPTIcon.svg"
import MarkdownRenderer from "@/components/MarkdownRenderer"
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

export default function ChatInterface() {
  const { user, isLoaded } = useUser()
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState("")
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [chats, setChats] = useState<Chat[]>([])
  const [isLoading, setIsLoading] = useState(false)
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
  
  // New states for model management and loading optimization
  const [availableModels, setAvailableModels] = useState<any[]>([])
  const [selectedModel, setSelectedModel] = useState('gpt-4o')
  const [isSidebarLoading, setIsSidebarLoading] = useState(false)
  const [isChatsLoaded, setIsChatsLoaded] = useState(false)
  const [modelsLoaded, setModelsLoaded] = useState(false)
  const sendingMessageRef = useRef(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // Add this effect to close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event:any) => {
      if (isModelDropdownOpen && !event.target.closest('.relative')) {
        setIsModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isModelDropdownOpen]);

  // Load user's chats when authenticated
  useEffect(() => {
    if (user && !isChatsLoaded) {
      loadUserChats()
      setIsChatsLoaded(true)
    }
  }, [user, isChatsLoaded])

  // Load models separately to avoid blocking chat loading
  useEffect(() => {
    if (user && !modelsLoaded) {
      loadAvailableModels()
      setModelsLoaded(true)
    }
  }, [user, modelsLoaded])

  // Load available models
  const loadAvailableModels = async () => {
    try {
      // Check if we have fresh cached models (cache for 10 minutes)
      const cachedData = localStorage.getItem('modelsCache')
      const cachedModel = localStorage.getItem('selectedModel')
      
      if (cachedData) {
        const { models, timestamp, expiresIn } = JSON.parse(cachedData)
        const isExpired = Date.now() - timestamp > expiresIn
        
        if (!isExpired && models?.length > 0) {
          setAvailableModels(models)
          if (cachedModel) {
            setSelectedModel(cachedModel)
          }
          // Still fetch fresh data in background, but don't block UI
          fetchFreshModels()
          return
        }
      }

      // If no cache or expired, fetch immediately
      await fetchFreshModels()
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load models:', error)
      }
      setFallbackModels()
    }
  }

  const fetchFreshModels = async () => {
    try {
      const response = await fetch('/api/models')
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      
      if (data.models && data.models.length > 0) {
        setAvailableModels(data.models)
        setSelectedModel(prev => {
          // Keep current selection if it's still available
          const currentModelExists = data.models.some((m: any) => m.id === prev)
          return currentModelExists ? prev : data.currentModel || data.models[0]?.id || 'gpt-4o'
        })
        
        // Cache with expiration
        const cacheData = {
          models: data.models,
          modelsByCategory: data.modelsByCategory,
          timestamp: Date.now(),
          expiresIn: 10 * 60 * 1000 // 10 minutes
        }
        localStorage.setItem('modelsCache', JSON.stringify(cacheData))
      } else {
        throw new Error('No models received from API')
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching fresh models:', error)
      }
      setFallbackModels()
    }
  }

  const setFallbackModels = () => {
    const fallbackModels = [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        description: 'Most capable model with vision and advanced reasoning',
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
    
    // Cache fallback models
    const cacheData = {
      models: fallbackModels,
      timestamp: Date.now(),
      expiresIn: 5 * 60 * 1000 // 5 minutes for fallback
    }
    localStorage.setItem('modelsCache', JSON.stringify(cacheData))
  }


  const loadChatMessages = async (chatId: string) => {
    if (sendingMessageRef.current) return
    
    try {
      setIsLoading(true)
      const response = await fetchWithRetry(`/api/chats/${chatId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
      if (!response.ok) {
        if (response.status === 401) {
          setError('Session expired. Please refresh the page.')
          return
        }
        if (response.status === 404) {
          setError('Chat not found')
          return
        }
        throw new Error(`Failed to load messages: ${response.status}`)
      }

      const chat = await response.json()
      if (!sendingMessageRef.current) {
        setMessages(chat.messages || [])
        setError(null)
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error loading chat messages:', error)
      }
      setError('Failed to load messages')
    } finally {
      setIsLoading(false)
    }
  }

  // Add retry mechanism for authentication failures
  const fetchWithRetry = async (url: string, options: RequestInit, retries = 3): Promise<Response> => {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, options)
        
        // If 401, try to refresh the session and retry
        if (response.status === 401 && i < retries - 1) {
          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 1000))
          continue
        }
        
        return response
      } catch (error) {
        if (i === retries - 1) throw error
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    throw new Error('Max retries exceeded')
  }

  // Enhanced chat loading with error handling
  const loadUserChats = async () => {
    if (!user) return
    
    try {
      setIsSidebarLoading(true)
      const response = await fetchWithRetry('/api/chats', {
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
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error loading chats:', error)
      }
      setError('Failed to load chat history')
    } finally {
      setIsSidebarLoading(false)
    }
  }

  const createNewChat = async () => {
    if (!user) return

    try {
      setIsLoading(true)
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
      
      // Immediately update UI for better real-time experience
      setChats(prev => [newChat, ...prev])
      setMessages([])
      setActiveChatId(newChat.id)
      setError(null) // Clear any previous errors
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error creating new chat:', error)
      }
      setError('Failed to create chat')
    } finally {
      setIsLoading(false)
    }
  }

  const updateChatTitle = async (chatId: string, newTitle: string) => {
    try {
      // Optimistic update
      setChats(prev => prev.map(chat => 
        chat.id === chatId ? { ...chat, title: newTitle } : chat
      ))
      
      const response = await fetch(`/api/chats/${chatId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: newTitle
        }),
      })
      
      if (!response.ok) {
        // Revert on error - reload chats
        loadUserChats()
        throw new Error('Failed to update title')
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error updating chat title:', error)
      }
      setError('Failed to update chat title')
    }
  }

  const deleteChat = async (chatId: string) => {
    try {
      // Optimistic update - remove from UI immediately
      const originalChats = [...chats]
      setChats(chats.filter(chat => chat.id !== chatId))
      
      // If deleting the active chat, clear the interface
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
        // Revert optimistic update on error
        setChats(originalChats)
        if (activeChatId === chatId) {
          // Reload the chat if it was active
          loadChatMessages(chatId)
        }
        
        if (response.status === 401) {
          setError('Session expired. Please log in again.')
          return
        }
        throw new Error(`Failed to delete chat: ${response.status}`)
      }

      const result = await response.json()
      if (!result.success) {
        // Revert optimistic update on error
        setChats(originalChats)
        throw new Error('Delete operation failed')
      }

      // Success - the optimistic update is already applied
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error deleting chat:', error)
      }
      setError('Failed to delete chat. Please try again.')
    }
  }

  const validateFile = (file: File): string | null => {
    const maxSize = file.type.startsWith('image/') ? 10 * 1024 * 1024 : 100 * 1024 * 1024 // Increased to 100MB for documents
    
    if (file.size > maxSize) {
      return `File too large. Maximum size is ${file.type.startsWith('image/') ? '10MB for images' : '100MB for documents'}.`
    }

    const allowedTypes = [
      // Images
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml',
      // Documents
      'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/rtf',
      // Text files
      'text/plain', 'text/csv', 'text/html', 'text/css', 'text/javascript', 'text/markdown',
      'application/json', 'application/xml', 'text/xml',
      // Code files
      'text/x-python', 'text/x-java', 'text/x-c', 'text/x-cpp', 'text/x-csharp',
      'application/javascript', 'application/typescript',
      // Archives (read-only)
      'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
      // Other common formats
      'application/epub+zip', 'application/x-latex'
    ]

    const fileExtension = file.name.toLowerCase().split('.').pop()
    const allowedExtensions = [
      'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg',
      'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'rtf',
      'txt', 'csv', 'html', 'css', 'js', 'ts', 'jsx', 'tsx', 'md', 'markdown',
      'json', 'xml', 'yaml', 'yml',
      'py', 'java', 'c', 'cpp', 'cs', 'php', 'rb', 'go', 'rs', 'swift',
      'zip', 'rar', '7z', 'epub', 'tex'
    ]

    const isValidType = allowedTypes.some(type => file.type.includes(type)) || 
                       allowedExtensions.includes(fileExtension || '')

    if (!isValidType) {
      return 'File type not supported. Supported: images, PDFs, Office docs, text files, code files, and archives.'
    }

    return null
  }

  const processFileImmediately = async (file: File) => {
    try {
      setIsProcessingFiles(true)
      setUploadProgress(`Processing ${file.name}...`)

      // Process file immediately without saving to database
      const formData = new FormData()
      formData.append('file', file)
      formData.append('extractText', 'true')
      formData.append('analyzeContent', 'true')
      
      if (file.type.startsWith('image/')) {
        formData.append('prompt', 'Please analyze this image and describe what you see in detail.')
      }

      const response = await fetch('/api/file-process', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        let errorMessage = `Processing failed: ${response.status}`
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorMessage
        } catch (parseError) {
          // If we can't parse JSON, use the response text
          try {
            const errorText = await response.text()
            if (errorText.includes('<!DOCTYPE')) {
              errorMessage = `Authentication error or endpoint not found (${response.status})`
            } else {
              errorMessage = errorText || errorMessage
            }
          } catch {
            errorMessage = `Processing failed: ${response.status}`
          }
        }
        throw new Error(errorMessage)
      }

      const result = await response.json()
      
      // Store processed file data with enhanced metadata
      const processedFile = {
        ...result,
        originalFile: file,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size
      }
      
      setProcessedFiles(prev => [...prev, processedFile])
      
      // Enhanced success message for PDFs
      if (file.type === 'application/pdf') {
        if (result.extractedText && result.extractedText.length > 0) {
          const textLength = result.extractedText.length
          const readableSize = textLength > 1000 ? `${Math.round(textLength/1000)}k` : textLength
          setUploadProgress(`✓ PDF processed: ${readableSize} characters extracted`)
        } else {
          setUploadProgress(`✓ PDF uploaded (no text content found)`)
        }
      } else {
        setUploadProgress(`✓ ${file.name} ready!`)
      }
      
      setTimeout(() => setUploadProgress(""), 2000)
      
      return processedFile

    } catch (error) {
      console.error('File processing error:', error)
      setError(`Failed to process ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return null
    } finally {
      setIsProcessingFiles(false)
    }
  }

  const handleFileAttachment = async (files: FileList | File[]) => {
    const newFiles: File[] = []
    const newPreviewUrls: string[] = []
    const errors: string[] = []

    for (const file of Array.from(files)) {
      // Check if file is already attached
      const isDuplicate = attachedFiles.some(attachedFile => 
        attachedFile.name === file.name && attachedFile.size === file.size
      )

      if (isDuplicate) {
        errors.push(`${file.name} is already attached`)
        continue
      }

      // Validate file
      const validationError = validateFile(file)
      if (validationError) {
        errors.push(`${file.name}: ${validationError}`)
        continue
      }

      newFiles.push(file)

      // Create preview URL for images
      if (file.type.startsWith('image/')) {
        const previewUrl = URL.createObjectURL(file)
        newPreviewUrls.push(previewUrl)
      } else {
        newPreviewUrls.push('')
      }

      // Process file immediately in background
      processFileImmediately(file)
    }

    if (errors.length > 0) {
      setError(errors.join('. '))
    } else {
      setError(null)
    }

    if (newFiles.length > 0) {
      setAttachedFiles(prev => [...prev, ...newFiles])
      setFilePreviewUrls(prev => [...prev, ...newPreviewUrls])
    }
  }

  const removeAttachedFile = (index: number) => {
    // Revoke object URL if it exists
    if (filePreviewUrls[index]) {
      URL.revokeObjectURL(filePreviewUrls[index])
    }

    const removedFile = attachedFiles[index]
    
    // Remove from attached files
    setAttachedFiles(prev => prev.filter((_, i) => i !== index))
    setFilePreviewUrls(prev => prev.filter((_, i) => i !== index))
    
    // Remove corresponding processed file
    if (removedFile) {
      setProcessedFiles(prev => prev.filter(pf => 
        !(pf.fileName === removedFile.name && pf.fileSize === removedFile.size)
      ))
    }
    
    setError(null)
  }

  const clearAttachedFiles = () => {
    // Revoke all object URLs
    filePreviewUrls.forEach(url => {
      if (url) URL.revokeObjectURL(url)
    })
    
    setAttachedFiles([])
    setFilePreviewUrls([])
    setProcessedFiles([])
  }

  const uploadAttachedFiles = async (chatId: string) => {
    if (attachedFiles.length === 0) return []

    const uploadResults = []

    for (let i = 0; i < attachedFiles.length; i++) {
      const file = attachedFiles[i]
      setUploadProgress(`Uploading ${file.name}...`)

      const formData = new FormData()
      formData.append('file', file)
      formData.append('chatId', chatId)
      
      // Enable text extraction and analysis for documents
      if (!file.type.startsWith('image/')) {
        formData.append('extractText', 'true')
        formData.append('analyzeContent', 'true')
      }

      try {
        // Choose the appropriate endpoint based on file type
        const endpoint = file.type.startsWith('image/') ? '/api/image-process' : '/api/file-upload'
        
        if (file.type.startsWith('image/')) {
          formData.append('prompt', 'Please analyze this image and describe what you see in detail.')
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          let errorMessage = `Upload failed: ${response.status}`
          try {
            const errorData = await response.json()
            errorMessage = errorData.error || errorMessage
          } catch (parseError) {
            // If we can't parse JSON, use the response text
            try {
              const errorText = await response.text()
              if (errorText.includes('<!DOCTYPE')) {
                errorMessage = `Authentication error or endpoint not found (${response.status})`
              } else {
                errorMessage = errorText || errorMessage
              }
            } catch {
              errorMessage = `Upload failed: ${response.status}`
            }
          }
          throw new Error(errorMessage)
        }

        const result = await response.json()
        uploadResults.push(result)
        
      } catch (error) {
        console.error('File upload error:', error)
        throw error
      }
    }

    return uploadResults
  }

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFileAttachment(e.target.files)
    }
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

  const getFileIcon = (fileType: string, fileName?: string) => {
    const extension = fileName?.toLowerCase().split('.').pop() || ''
    
    // Images
    if (fileType.startsWith('image/')) return <Image className="h-4 w-4" />
    
    // Documents
    if (fileType.includes('pdf') || extension === 'pdf') return <FileText className="h-4 w-4" />
    if (fileType.includes('word') || fileType.includes('document') || ['doc', 'docx'].includes(extension)) return <FileText className="h-4 w-4" />
    if (fileType.includes('spreadsheet') || ['xls', 'xlsx', 'csv'].includes(extension)) return <FileText className="h-4 w-4" />
    if (fileType.includes('presentation') || ['ppt', 'pptx'].includes(extension)) return <FileText className="h-4 w-4" />
    
    // Text files
    if (fileType.startsWith('text/') || ['txt', 'md', 'markdown', 'html', 'css'].includes(extension)) return <FileText className="h-4 w-4" />
    
    // Code files
    if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'cs', 'php', 'rb', 'go', 'rs', 'swift'].includes(extension)) return <FileText className="h-4 w-4" />
    
    // Data files
    if (['json', 'xml', 'yaml', 'yml'].includes(extension)) return <FileText className="h-4 w-4" />
    
    // Archives
    if (fileType.includes('zip') || fileType.includes('rar') || fileType.includes('7z') || ['zip', 'rar', '7z'].includes(extension)) return <File className="h-4 w-4" />
    
    // Default
    return <File className="h-4 w-4" />
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const handleSendMessage = async () => {
    if ((!inputValue.trim() && attachedFiles.length === 0) || !user || isLoading || sendingMessageRef.current) return
    
    sendingMessageRef.current = true

    // Check if all attached files have been processed
    const hasUnprocessedFiles = attachedFiles.some(file => 
      !processedFiles.find(pf => pf.fileName === file.name && pf.fileSize === file.size)
    )
    
    if (hasUnprocessedFiles) {
      setError('Please wait for all files to finish processing')
      sendingMessageRef.current = false
      return
    }

    let currentChatId = activeChatId
    
    // Create new chat if none exists
    if (!currentChatId) {
      try {
        const chatTitle = inputValue.trim() 
          ? inputValue.substring(0, 50) + (inputValue.length > 50 ? '...' : '')
          : attachedFiles.length > 0 
            ? `File: ${attachedFiles[0].name}`
            : 'New Chat'

        const response = await fetch('/api/chats', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: chatTitle,
          }),
        })

        if (!response.ok) throw new Error('Failed to create chat')
        
        const newChat = await response.json()
        setChats(prev => [newChat, ...prev])
        setActiveChatId(newChat.id)
        currentChatId = newChat.id
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error creating new chat:', error)
        }
        setError('Failed to create chat')
        sendingMessageRef.current = false
        return
      }
    }

    // Handle text message and files together
    if (inputValue.trim() || attachedFiles.length > 0) {
      const newMessage: Message = {
        id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        content: inputValue || "File attachment",
        role: "user",
        timestamp: new Date(),
      }

      setMessages(prev => [...prev, newMessage])
      const messageContent = inputValue
      setInputValue("")

      // Prepare file data for the message
      let fileData = null
      if (attachedFiles.length > 0) {
        const file = attachedFiles[0] // Handle first file for now
        const processedFile = processedFiles.find(pf => 
          pf.fileName === file.name && pf.fileSize === file.size
        )
        
        if (!processedFile) {
          setError('Please wait for files to finish processing')
          sendingMessageRef.current = false
          return
        }
        
        fileData = processedFile
      }

      // Send message with optional file data
      setIsLoading(true)
      setIsSidebarLoading(true) // Show loading in sidebar when AI is responding
      
      try {      const requestBody = {
        message: fileData 
          ? `${messageContent || "What is the content of this file? Please analyze and summarize it."}`
          : messageContent || "Hello",
        chatId: currentChatId,
        fileData: fileData,
        model: selectedModel
      }
      
      // Show processing status for PDFs
      if (fileData && fileData.fileType === 'application/pdf') {
        setUploadProgress(`Processing PDF: ${fileData.fileName}`)
      }
        
        const response = await fetch('/api/chats/message', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        })

        if (!response.ok) throw new Error('Failed to send message')

        const aiResponse = await response.json()
        
        const assistantMessage: Message = {
          id: `assistant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          content: aiResponse.message,
          role: "assistant",
          timestamp: new Date(),
        }
        
        // Add assistant message immediately for real-time updates
        setMessages(prev => [...prev, assistantMessage])
        
        // Clear attached files after successful send
        if (attachedFiles.length > 0) {
          clearAttachedFiles()
        }
        
        // Refresh chat list to update lastMessage in background
        loadUserChats()
        
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error sending message:', error)
        }
        setError('Failed to send message')
      } finally {
        setIsLoading(false)
        setIsSidebarLoading(false)
        sendingMessageRef.current = false
      }
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const selectChat = async (chatId: string) => {
    // Don't switch chats while a message is being sent
    if (isLoading) return
    
    setActiveChatId(chatId)
    await loadChatMessages(chatId)
  }

  // Handle model selection with persistence and validation
  const handleModelSelect = (modelId: string) => {
    // Validate that the model exists in our available models
    const modelExists = availableModels.some(m => m.id === modelId)
    if (!modelExists) {
      console.warn(`Model ${modelId} not found in available models`)
      return
    }
    
    const selectedModelInfo = availableModels.find(m => m.id === modelId)
    
    setSelectedModel(modelId)
    setIsModelDropdownOpen(false)
    localStorage.setItem('selectedModel', modelId)
    
    // Show a brief confirmation message
    setError(null) // Clear any previous errors
    
    // Optional: Add a brief success message
    // You could add a toast notification here if needed
  }

  // Auto-refresh sidebar when messages are updated
  useEffect(() => {
    if (activeChatId && messages.length > 0) {
      // Update the chat list in the background to show latest message
      const timeoutId = setTimeout(() => {
        loadUserChats()
      }, 1000) // Debounce to avoid too many requests
      
      return () => clearTimeout(timeoutId)
    }
  }, [messages.length, activeChatId])

  // Enhanced error boundary and auth state management
  useEffect(() => {
    if (user) {
      setError(null) // Clear any auth errors when user is available
    }
  }, [user])

  if (!isLoaded) {
    return (
      <div className="flex h-screen bg-[#212121] text-white items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#acacac]">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex h-screen bg-[#212121] text-white items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-6">
            AI
          </div>
          <h1 className="text-3xl font-bold mb-4">Welcome to ChatGPT Clone</h1>
          <p className="text-[#acacac] mb-8">Sign in to start chatting with AI and save your conversations.</p>
          <div className="space-y-4">
            <Link href="/sign-in">
              <button className="w-full bg-white text-black hover:bg-gray-100 gap-2 flex items-center justify-center px-4 py-2 rounded-md">
                <LogIn className="h-4 w-4" />
                Sign In
              </button>
            </Link>
            <Link href="/sign-up">
              <button className="w-full border border-[#2f2f2f] text-white hover:bg-[#2f2f2f] px-4 py-2 rounded-md">
                Create Account
              </button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-[#212121] text-white">
      {/* Sidebar */}
<div
  className={`${isSidebarOpen ? "w-64" : "w-0"} transition-all duration-300 overflow-hidden bg-[#171717] border-r border-[#2f2f2f] flex flex-col h-full`}
>
  <div className="p-4 flex items-center justify-between">
    <button>
      <img src={GPTIcon.src} alt="GPT Icon" className="h-6 w-6" />
    </button>
    <button onClick={() => setIsSidebarOpen(false)}>
      {isSidebarOpen ? (
        <PanelLeft className="h-5 w-5 text-gray-400" />
      ) : (
        <Menu className="h-5 w-5 text-gray-400" />
      )}
    </button>
  </div>

  <div className="flex-1 overflow-y-auto">
    <div className="">
      <button
        className="w-full justify-start gap-3 bg-transparent hover:bg-[#2f2f2f] text-white h-11 text-sm font-normal flex items-center px-4 rounded-md"
        onClick={createNewChat}
        disabled={isLoading}
      >
        <PencilLine className="h-4 w-4" />
        New chat
      </button>
    </div>

    <div className="">
      <button
        className="w-full justify-start gap-3 bg-transparent hover:bg-[#2f2f2f] text-white h-11 text-sm font-normal flex items-center px-4 rounded-md"
      >
        <Search className="h-4 w-4" />
        Search chats
      </button>
    </div>

    <div className="">
      <button
        className="w-full justify-start gap-3 bg-transparent hover:bg[#2f2f2f] text-white h-11 text-sm font-normal flex items-center px-4 rounded-md"
      >
        <Images className="h-4 w-4" />
        Library
      </button>
    </div>

    <div className="px-4 mb-4"></div>

    <div className="">
      <button
        className="w-full justify-start gap-3 bg-transparent hover:bg-[#2f2f2f] text-white h-11 text-sm font-normal flex items-center px-4 rounded-md"
      >
        <SquarePlay className="h-4 w-4" />
        Sora
      </button>
    </div>

    <div className="">
      <button
        className="w-full justify-start gap-3 bg-transparent hover:bg-[#2f2f2f] text-white h-11 text-sm font-normal flex items-center px-4 rounded-md"
      >
        <LayoutGrid className="h-4 w-4" />
        GPTs
      </button>
    </div>
    

    <div className="p-2"></div>

    <div className="flex-1 overflow-hidden">
      <div className="px-3 py-3">
        <h3 className="text-xs font-medium text-[#8e8ea0] uppercase tracking-wider">Chats</h3>
      </div>
      <div className="flex-1 px-2">
        {isSidebarLoading || isLoading ? (
          <div className="flex flex-col items-center justify-center py-8 space-y-2">
            <div className="w-6 h-6 border-2 border-[#8e8ea0] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm text-[#8e8ea0]">
              {isSidebarLoading ? 'Loading chats...' : 'Processing...'}
            </p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-8 space-y-2 text-center">
            <p className="text-sm text-red-400">{error}</p>
            <button 
              onClick={loadUserChats}
              className="text-sm text-[#ab68ff] hover:underline"
            >
              Retry
            </button>
          </div>
        ) : chats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 space-y-2">
            <p className="text-sm text-[#8e8ea0]">No chats yet</p>
            <button 
              onClick={createNewChat}
              className="text-sm text-[#ab68ff] hover:underline"
            >
              Create your first chat
            </button>
          </div>
        ) : (
          <div className="space-y-0">
            {chats.map((chat) => (
              <div key={chat.id} className="group relative">
                <button
                  className={`w-full justify-start text-left h-auto p-2 text-sm font-normal flex ${
                    activeChatId === chat.id 
                      ? "bg-[#2f2f2f] text-white" 
                      : "text-[#acacac] hover:bg-[#2f2f2f] hover:text-white"
                  } rounded-md transition-colors duration-150`}
                  onClick={() => selectChat(chat.id)}
                >
                  <div className="truncate flex-1 text-left">
                    <div className="truncate">{chat.title}</div>
                    <div className="text-xs text-[#8e8ea0] truncate mt-1">
                      {chat.messageCount || 0} messages • {new Date(chat.timestamp).toLocaleDateString()}
                    </div>
                  </div>
                </button>
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 opacity-0 group-hover:opacity-100 text-[#acacac] hover:text-red-500 transition-opacity duration-150"
                  onClick={async (e) => {
                    e.stopPropagation()
                    if (confirm('Are you sure you want to delete this chat?')) {
                      await deleteChat(chat.id)
                    }
                  }}
                  aria-label="Delete chat"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>

  <div className="p-2 border-t border-[#2f2f2f]">
    <button
      className="w-full justify-start gap-3 text-white hover:bg-[#2f2f2f] hover:text-white h-auto p-2 flex items-center rounded-md"
    >
      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border border-[#8e8ea0]">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="flex-1 text-left">
        <div className="text-sm text-white">Upgrade plan</div>
        <div className="text-xs text-[#8e8ea0]">More access to the best models</div>
      </div>
    </button>
  </div>
</div>
{/* Main Content */}
<div className="flex-1 flex flex-col">
  {/* Header */}
  <header className="flex items-center justify-between p-2 border-b border-[#2f2f2f]">
    <div className="flex items-center gap-3">
      <button
        className=" text-white hover:text-white hover:bg-[#2f2f2f] p-2 rounded-md"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Model Selector Dropdown */}
      <div className="relative">
        <button
          className="flex items-center gap-2 text-white hover:bg-[#2f2f2f] px-3 py-2 rounded-lg transition-colors"
          onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
        >
          <div className="w-6 h-6 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
            {(() => {
              const currentModel = availableModels.find(m => m.id === selectedModel);
              const IconComponent = currentModel?.icon === 'sparkles' ? Sparkles : 
                                  currentModel?.icon === 'zap' ? Sparkles : 
                                  currentModel?.icon === 'cpu' ? Settings : 
                                  currentModel?.icon === 'brain' ? Settings : Shell;
              return <IconComponent className="h-3 w-3 text-white" />;
            })()}
          </div>
          <div className="text-left">
            <div className="text-sm font-medium">
              {availableModels.find(m => m.id === selectedModel)?.name || 'ChatGPT'}
            </div>
            <div className="text-xs text-[#8e8ea0]">
              {availableModels.find(m => m.id === selectedModel)?.pricing || 'standard'} • {selectedModel.includes('4o') ? 'Vision' : 'Text'}
            </div>
          </div>
          <ChevronDown className={`h-4 w-4 transition-transform ${isModelDropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {isModelDropdownOpen && (
          <div className="absolute left-0 mt-2 w-96 bg-[#252525] border border-[#2f2f2f] rounded-md shadow-lg z-10 max-h-96 overflow-y-auto">
            <div className="p-3">
              <div className="mb-3">
                <h3 className="text-sm font-medium text-white mb-2">Choose Model</h3>
                <p className="text-xs text-[#8e8ea0]">Select an AI model for your conversation</p>
              </div>
              
              {availableModels.length > 0 ? (
                <div className="space-y-1">
                  {/* Group models by category */}
                  {['premium', 'standard', 'budget'].map(category => {
                    const categoryModels = availableModels.filter(m => 
                      (m.pricing || m.category) === category
                    );
                    
                    if (categoryModels.length === 0) return null;
                    
                    return (
                      <div key={category} className="mb-4">
                        <div className="text-xs font-medium text-[#8e8ea0] uppercase tracking-wider mb-2 px-1">
                          {category === 'premium' ? '⭐ Premium' : 
                           category === 'standard' ? '⚡ Standard' : 
                           '💰 Budget'}
                        </div>
                        {categoryModels.map((model) => {
                          const IconComponent = model.icon === 'sparkles' ? Sparkles : 
                                              model.icon === 'zap' ? Sparkles : 
                                              model.icon === 'cpu' ? Settings : 
                                              model.icon === 'brain' ? Settings : Shell;
                          
                          return (
                            <button
                              key={model.id}
                              className={`w-full flex items-start gap-3 p-3 hover:bg-[#2f2f2f] rounded-lg transition-colors ${
                                selectedModel === model.id ? 'bg-[#2f2f2f] ring-1 ring-blue-500' : ''
                              }`}
                              onClick={() => handleModelSelect(model.id)}
                            >
                              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold">
                                <IconComponent className="h-4 w-4 text-white" />
                              </div>
                              <div className="flex-1 text-left min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-white">{model.name}</span>
                                  {selectedModel === model.id && (
                                    <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                                  )}
                                </div>
                                <div className="text-xs text-[#8e8ea0] mt-1">{model.description}</div>
                                
                                {/* Additional model info */}
                                <div className="flex items-center gap-3 mt-2 text-xs text-[#6e6e80]">
                                  {model.contextWindow && (
                                    <span>Context: {model.contextWindow.toLocaleString()}</span>
                                  )}
                                  {model.capabilities && (
                                    <span>
                                      {model.capabilities.includes('vision') && '👁️ Vision '}
                                      {model.capabilities.includes('function_calling') && '⚙️ Functions '}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 text-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mx-auto mb-2"></div>
                  <div className="text-sm text-[#8e8ea0]">Loading models...</div>
                </div>
              )}
              
              {/* Refresh button */}
              <div className="mt-4 pt-3 border-t border-[#2f2f2f]">
                <button
                  onClick={() => {
                    localStorage.removeItem('modelsCache');
                    loadAvailableModels();
                  }}
                  className="w-full flex items-center justify-center gap-2 text-xs text-[#8e8ea0] hover:text-white p-2 rounded-md hover:bg-[#2f2f2f]"
                >
                  <RefreshCw className="h-3 w-3" />
                  Refresh Models
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>

    <div className="flex items-center gap-3">
      <button className="text-white hover:text-white hover:bg-[#2f2f2f] gap-2 flex items-center p-2 rounded-md">
        <Share className="h-4 w-4" /> Share
      </button>
      <button className="text-white hover:text-white hover:bg-[#2f2f2f] p-2 rounded-md">
        <MoreHorizontal className="h-5 w-5" />
      </button>
      
      {/* User Profile */}
      <div className="flex items-center gap-2 rounded-full px-3 py-1">
        <UserButton 
          afterSignOutUrl="/"
          appearance={{
            elements: {
              avatarBox: "w-6 h-6"
            }
          }}
        />
      </div>
    </div>
  </header>
        {/* Chat Messages */}
        <div className="flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto">
            <div className="max-w-3xl mx-auto p-4 space-y-6">
              {messages.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-6">
                    AI
                  </div>
                  <h2 className="text-2xl font-bold mb-4">Hello, {user.firstName}!</h2>
                  <p className="text-[#acacac]">Start a conversation by typing a message below.</p>
                </div>
              ) : (
                messages.map((message, index) => (
                  <div key={message.id} className="space-y-4">
                    <div className={`flex gap-4 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] ${message.role === "user" ? "ml-auto" : ""}`}>
                        <div
                          className={`rounded-2xl px-4 py-3 ${
                            message.role === "user" ? "bg-[#2f2f2f] text-white" : "bg-transparent text-white"
                          }`}
                        >
                          {message.type === "file" && message.file ? (
                            <div className="space-y-3">
                              <div className="flex items-center gap-3 p-3 bg-[#404040] rounded-lg">
                                {getFileIcon(message.file.fileType, message.file.name)}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{message.file.name}</p>
                                  <p className="text-xs text-[#acacac]">
                                    {message.file.size ? formatFileSize(message.file.size) : ''} • {message.file.fileType}
                                  </p>
                                </div>
                                <a
                                  href={message.file.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[#ab68ff] hover:text-[#9c5ce8] text-sm"
                                >
                                  View
                                </a>
                              </div>
                              
                              {message.file.fileType.startsWith('image/') ? (
                                <div className="rounded-lg overflow-hidden">
                                  <img 
                                    src={message.file.url} 
                                    alt={message.file.name}
                                    className="max-w-full h-auto max-h-64 object-contain"
                                  />
                                </div>
                              ) : null}
                              
                              {message.content && (
                                <p className="text-[15px] leading-relaxed">{message.content}</p>
                              )}
                            </div>
                          ) : (
                            message.role === "assistant" ? (
                              <MarkdownRenderer content={message.content} />
                            ) : (
                              <p className="text-[15px] leading-relaxed">{message.content}</p>
                            )
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Message Actions for Assistant Messages */}
                    {message.role === "assistant" && index === messages.length - 1 && (
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          className="h-8 w-8 text-[#8e8ea0] hover:text-white hover:bg-[#2f2f2f] rounded-full flex items-center justify-center"
                          onClick={() => navigator.clipboard.writeText(message.content)}
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          className="h-8 w-8 text-[#8e8ea0] hover:text-white hover:bg-[#2f2f2f] rounded-full flex items-center justify-center"
                        >
                          <ThumbsUp className="h-4 w-4" />
                        </button>
                        <button
                          className="h-8 w-8 text-[#8e8ea0] hover:text-white hover:bg-[#2f2f2f] rounded-full flex items-center justify-center"
                        >
                          <ThumbsDown className="h-4 w-4" />
                        </button>
                        <button
                          className="h-8 w-8 text-[#8e8ea0] hover:text-white hover:bg-[#2f2f2f] rounded-full flex items-center justify-center"
                        >
                          <VolumeX className="h-4 w-4" />
                        </button>
                        <button
                          className="h-8 w-8 text-[#8e8ea0] hover:text-white hover:bg-[#2f2f2f] rounded-full flex items-center justify-center"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          className="h-8 w-8 text-[#8e8ea0] hover:text-white hover:bg-[#2f2f2f] rounded-full flex items-center justify-center"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
              
              {/* Loading indicator */}
              {isLoading && (
                <div className="flex gap-4 justify-start">
                  <div className="max-w-[80%]">
                    <div className="bg-transparent text-white rounded-2xl px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                        <div className="w-2 h-2 bg-white rounded-full animate-pulse delay-100"></div>
                        <div className="w-2 h-2 bg-white rounded-full animate-pulse delay-200"></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Scroll to bottom marker */}
              <div ref={messagesEndRef} className="h-0"></div>
            </div>
          </div>
        </div>


        {/* Input Area */}
        <div className="p-4">
          <div className="max-w-3xl mx-auto">
            {/* Upload Progress Indicator */}
            {isUploading && (
              <div className="mb-4 p-3 bg-[#2f2f2f] rounded-lg border border-[#404040]">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-4 w-4 animate-spin text-[#ab68ff]" />
                  <span className="text-sm text-[#acacac]">{uploadProgress}</span>
                </div>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="mb-4 p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-4 w-4 text-red-400" />
                  <span className="text-sm text-red-400">{error}</span>
                  <button 
                    onClick={() => setError(null)}
                    className="ml-auto text-red-400 hover:text-red-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            <div 
              className={`relative bg-[#2f2f2f] rounded-3xl border transition-colors ${
                dragOver 
                  ? 'border-[#ab68ff] bg-[#ab68ff]/10' 
                  : 'border-[#404040] focus-within:border-[#565656]'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {/* Drag Overlay */}
              {dragOver && (
                <div className="absolute inset-0 bg-[#ab68ff]/20 border-2 border-dashed border-[#ab68ff] rounded-3xl flex items-center justify-center z-10">
                  <div className="text-center">
                    <Upload className="h-8 w-8 text-[#ab68ff] mx-auto mb-2" />
                    <p className="text-[#ab68ff] font-medium">Drop file to attach</p>
                    <p className="text-sm text-[#acacac]">Images, PDFs, Documents, Text files</p>
                  </div>
                </div>
              )}

              {/* File Attachment Preview */}
              {attachedFiles.length > 0 && (
                <div className="px-3 pt-3">
                  <div className="flex flex-wrap gap-2">
                    {attachedFiles.map((file, index) => {
                      const processedFile = processedFiles.find(pf => 
                        pf.fileName === file.name && pf.fileSize === file.size
                      )
                      const isProcessed = !!processedFile
                      const isProcessing = isProcessingFiles && !isProcessed

                      return (
                        <div key={index} className="flex items-center gap-2 bg-[#404040] rounded-lg p-2 max-w-xs">
                          <div className="flex-shrink-0 relative">
                            {file.type.startsWith('image/') && filePreviewUrls[index] ? (
                              <img 
                                src={filePreviewUrls[index]} 
                                alt={file.name}
                                className="w-8 h-8 object-cover rounded"
                              />
                            ) : (
                              getFileIcon(file.type, file.name)
                            )}
                            {isProcessing && (
                              <div className="absolute -top-1 -right-1">
                                <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
                              </div>
                            )}
                            {isProcessed && (
                              <div className="absolute -top-1 -right-1">
                                <CheckCircle className="h-3 w-3 text-green-400" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white truncate">{file.name}</p>
                            <p className="text-xs text-[#8e8ea0]">
                              {formatFileSize(file.size)}
                              {isProcessing && " • Processing..."}
                              {isProcessed && " • Ready"}
                            </p>
                          </div>
                          <button 
                            onClick={() => removeAttachedFile(index)}
                            className="text-[#8e8ea0] hover:text-red-400 flex-shrink-0"
                            title="Remove file"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-end gap-2 p-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[#8e8ea0] hover:text-white hover:bg-[#404040] h-8 w-8 rounded-full flex items-center justify-center"
                  title="Attach file"
                >
                  <Plus className="h-5 w-5" />
                </button>

                <div className="flex-1">
                  {/* Hidden File Input */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileInputChange}
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.rtf,.txt,.csv,.html,.css,.js,.ts,.jsx,.tsx,.md,.markdown,.json,.xml,.yaml,.yml,.py,.java,.c,.cpp,.cs,.php,.rb,.go,.rs,.swift,.zip,.rar,.7z,.epub,.tex"
                    multiple
                    className="hidden"
                  />

                  <input
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder={attachedFiles.length > 0 ? "Send a message with your files..." : "Message ChatGPT"}
                    disabled={isLoading || isUploading}
                    className="w-full border-0 bg-transparent text-white placeholder-[#8e8ea0] focus:outline-none min-h-[24px] text-[15px]"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    className="text-[#8e8ea0] hover:text-white hover:bg-[#404040] h-8 w-8 rounded-full flex items-center justify-center"
                  >
                    <Mic className="h-5 w-5" />
                  </button>

                  {/* Send Button */}
                  <button
                    onClick={handleSendMessage}
                    disabled={
                      (!inputValue.trim() && attachedFiles.length === 0) || 
                      isLoading || 
                      isUploading || 
                      isProcessingFiles ||
                      attachedFiles.some(file => 
                        !processedFiles.find(pf => pf.fileName === file.name && pf.fileSize === file.size)
                      )
                    }
                    className="bg-white text-black hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed h-8 w-8 rounded-full flex items-center justify-center"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            <p className="text-xs text-[#8e8ea0] text-center mt-3">
              ChatGPT can make mistakes. Check important info.{" "}
              <button className="underline hover:no-underline">See Cookie Preferences</button>.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}