import mongoose, { Schema, Document, model, models } from 'mongoose';

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  type?: 'text' | 'file';
  file?: {
    url: string;
    name: string;
    fileType: string;
    size?: number;
    extractedText?: string;
  };
  metadata?: Record<string, any>; // ✅ Added to support mem0
}

export interface ChatDocument extends Document {
  userId: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema: Schema<Message> = new Schema<Message>(
  {
    id: { type: String, required: true },
    content: { type: String, required: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    timestamp: { type: Date, required: true },
    type: { type: String, enum: ['text', 'file'], default: 'text' },
    file: {
      url: { type: String },
      name: { type: String },
      fileType: { type: String },
      size: { type: Number },
      extractedText: { type: String }
    },
    metadata: { type: Schema.Types.Mixed, required: false }, // ✅ Added to schema
  },
  { _id: false } // Don't generate _id for subdocuments
);

const ChatSchema: Schema<ChatDocument> = new Schema<ChatDocument>(
  {
    userId: { type: String, required: true },
    title: { type: String, required: true },
    messages: { type: [MessageSchema], default: [] },
  },
  {
    timestamps: true, // auto-add createdAt and updatedAt
  }
);

// Prevent model overwrite in dev
const Chat = models.Chat || model<ChatDocument>('Chat', ChatSchema);
export default Chat;
