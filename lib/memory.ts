import { OpenAI } from 'openai';
import { MongoClient, ObjectId } from 'mongodb';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const client = new MongoClient(process.env.MONGODB_URI!);
const db = client.db('chatgpt-clone');
const collection = db.collection<MemoryItem>('memory_vectors');

export interface MemoryItem {
  _id: ObjectId;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  metadata: Record<string, any>;
  embedding: number[];
  createdAt: Date;
}

export async function embed(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}

export async function addToMemory(
  entries: { content: string; role: 'user' | 'assistant'; metadata?: any }[],
  userId: string
) {
  const docs: MemoryItem[] = await Promise.all(
    entries.map(async (entry) => ({
      _id: new ObjectId(),
      userId,
      role: entry.role,
      content: entry.content,
      metadata: entry.metadata || {},
      embedding: await embed(entry.content),
      createdAt: new Date(),
    }))
  );

  await collection.insertMany(docs);
}

export async function searchMemory(
  query: string,
  userId: string,
  filter: Record<string, any> = {},
  limit = 4
): Promise<Pick<MemoryItem, 'content' | 'role'>[]> {
  const queryEmbedding = await embed(query);

  const all: MemoryItem[] = await collection.find({ userId, ...filter }).toArray();

  const withScores = all.map((item) => ({
    ...item,
    score: cosineSimilarity(item.embedding, queryEmbedding),
  }));

  return withScores
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => ({
      content: item.content,
      role: item.role,
    }));
}

function cosineSimilarity(a: number[], b: number[]) {
  const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return dot / (magA * magB);
}
