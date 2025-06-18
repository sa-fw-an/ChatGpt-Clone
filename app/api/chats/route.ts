// app/api/chats/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server' // Updated import
import clientPromise from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

// POST - Create new chat
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth() // Added await
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { title } = body

    const client = await clientPromise
    const db = client.db('chatgpt-clone')
    
    const newChat = {
      userId,
      title: title || 'New Chat',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }

    const result = await db.collection('chats').insertOne(newChat)

    return NextResponse.json({
      id: result.insertedId.toString(),
      title: newChat.title,
      lastMessage: 'New chat',
      timestamp: newChat.updatedAt,
      messageCount: 0,
      isActive: true
    })  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error creating chat:', error)
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const client = await clientPromise
    const db = client.db('chatgpt-clone')
    
    const chats = await db.collection('chats')
      .find({ userId })
      .sort({ updatedAt: -1 })
      .toArray()

    return NextResponse.json(chats.map(chat => ({
      id: chat._id.toString(),
      title: chat.title,
      lastMessage: chat.lastMessage || 'New chat',
      timestamp: chat.updatedAt,
      messageCount: chat.messages?.length || 0
    })))  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching chats:', error)
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}