// app/api/chats/[chatId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server' // Updated import
import clientPromise from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

// GET - Fetch specific chat with messages
export async function GET(
  request: NextRequest,
  { params }: { params: { chatId: string } }
) {
  try {
    const { userId } = await auth() // Added await
    const { chatId } = await params // Await params before using
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!ObjectId.isValid(chatId)) {
      return NextResponse.json({ error: 'Invalid chat ID' }, { status: 400 })
    }

    const client = await clientPromise
    const db = client.db('chatgpt-clone')
    
    const chat = await db.collection('chats').findOne({
      _id: new ObjectId(chatId),
      userId
    })

    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 })
    }

    return NextResponse.json({
      id: chat._id.toString(),
      title: chat.title,
      messages: chat.messages || [],
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt
    })
  } catch (error) {
    console.error('Error fetching chat:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT - Update chat (title or add messages)
export async function PUT(
  request: NextRequest,
  { params }: { params: { chatId: string } }
) {
  try {
    const { userId } = await auth() // Added await
    const { chatId } = await params // Await params before using
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!ObjectId.isValid(chatId)) {
      return NextResponse.json({ error: 'Invalid chat ID' }, { status: 400 })
    }

    const body = await request.json()
    const { title, messages } = body

    const client = await clientPromise
    const db = client.db('chatgpt-clone')
      const updateData: Record<string, any> = {
      updatedAt: new Date()
    }

    if (title !== undefined) updateData.title = title
    if (messages !== undefined) updateData.messages = messages

    const result = await db.collection('chats').updateOne(
      {
        _id: new ObjectId(chatId),
        userId
      },
      { $set: updateData }
    )

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating chat:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Delete chat
export async function DELETE(
  request: NextRequest,
  { params }: { params: { chatId: string } }
) {
  try {
    const { userId } = await auth() // Added await
    const { chatId } = await params // Await params before using
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!ObjectId.isValid(chatId)) {
      return NextResponse.json({ error: 'Invalid chat ID' }, { status: 400 })
    }    const client = await clientPromise
    const db = client.db('chatgpt-clone')
    
    const result = await db.collection('chats').deleteOne({
      _id: new ObjectId(chatId),
      userId
    })

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting chat:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}