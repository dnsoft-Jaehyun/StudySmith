declare module '@langchain/openai' {
  export class OpenAIEmbeddings {
    constructor(config?: any);
    embedQuery(text: string): Promise<number[]>;
    embedDocuments(documents: string[]): Promise<number[][]>;
  }

  export class ChatOpenAI {
    constructor(config?: any);
    invoke(messages: any): Promise<any>;
    stream(messages: any): AsyncGenerator<any>;
    batch(messages: any[]): Promise<any[]>;
    predict(text: string): Promise<string>;
    predictMessages(messages: any): Promise<any>;
  }
}

declare module '@langchain/core/documents' {
  export class Document {
    pageContent: string;
    metadata: Record<string, any>;
    
    constructor(input: {
      pageContent: string;
      metadata?: Record<string, any>;
    });
  }
}

declare module '@langchain/langgraph' {
  export interface StateType {
    [key: string]: any;
  }

  export type BinaryOperator<ValueType, UpdateType = ValueType> = (
    current: ValueType,
    update: UpdateType
  ) => ValueType;

  export interface SingleReducer<ValueType, UpdateType = ValueType> {
    value: BinaryOperator<ValueType, UpdateType>;
    default?: () => ValueType;
  }

  export interface ChannelReducers<StateType> {
    [key: string]: SingleReducer<any, any> | undefined;
  }

  export function createGraph(config: any): any;
  export function defineState(reducers: ChannelReducers<any>): any;
  export const END: unique symbol;
}

declare module '@langchain/community/vectorstores/chroma' {
  import { Document } from '@langchain/core/documents';
  
  export class Chroma {
    constructor(config?: any);
    similaritySearch(
      query: string, 
      k?: number, 
      filter?: Record<string, any>
    ): Promise<Document[]>;
    
    similaritySearchWithScore(
      query: string, 
      k?: number, 
      filter?: Record<string, any>
    ): Promise<[Document, number][]>;
    
    addDocuments(
      documents: Document[],
      ids?: string[]
    ): Promise<void>;
    
    delete(parameters: { ids: string[] }): Promise<void>;
  }
} 