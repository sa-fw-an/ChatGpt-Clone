'use server'

import { connectToDatabase } from '@/lib/database'
import User from '@/models/User'

interface CreateUserParams {
  clerkId: string
  email: string
  firstName: string
  lastName: string
  imageUrl?: string
}

interface UpdateUserParams {
  clerkId: string
  updateData: {
    firstName?: string
    lastName?: string
    imageUrl?: string
  }
}

export async function createUser(userData: CreateUserParams) {
  try {
    await connectToDatabase()
    
    const newUser = await User.create({
      ...userData,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    return JSON.parse(JSON.stringify(newUser))
  } catch (error) {
    console.error('Error creating user:', error)
    throw error
  }
}

export async function updateUser(clerkId: string, updateData: UpdateUserParams['updateData']) {
  try {
    await connectToDatabase()
    
    const updatedUser = await User.findOneAndUpdate(
      { clerkId },
      { 
        ...updateData, 
        updatedAt: new Date() 
      },
      { new: true }
    )

    if (!updatedUser) {
      throw new Error('User not found')
    }

    return JSON.parse(JSON.stringify(updatedUser))
  } catch (error) {
    console.error('Error updating user:', error)
    throw error
  }
}

export async function deleteUser(clerkId: string) {
  try {
    await connectToDatabase()
    
    const deletedUser = await User.findOneAndDelete({ clerkId })
    
    if (!deletedUser) {
      throw new Error('User not found')
    }

    return JSON.parse(JSON.stringify(deletedUser))
  } catch (error) {
    console.error('Error deleting user:', error)
    throw error
  }
}

export async function getUserByClerkId(clerkId: string) {
  try {
    await connectToDatabase()
    
    const user = await User.findOne({ clerkId })
    
    if (!user) {
      return null
    }

    return JSON.parse(JSON.stringify(user))
  } catch (error) {
    console.error('Error getting user:', error)
    throw error
  }
}