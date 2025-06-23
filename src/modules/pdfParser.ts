import { TextSplitter, TokenTextSplitter } from 'langchain/text_splitter';
import { get_encoding } from '@dqbd/tiktoken';
import pdf from 'pdf-parse';

const tokenizer = get_encoding('cl100k_base');

interface Chunk {
    id: string;
    content: string;
    tokens: number;
    metadata: {
        page_number: number;
        chunk_index: number;
    };
}

interface ParsingResult {
    text: string;
    numPages: number;
    numChunks: number;
    chunks: Chunk[];
}

export class PDFParser {
    private textSplitter: TextSplitter;

    constructor() {
        this.textSplitter = new TokenTextSplitter({
            encodingName: 'cl100k_base',
            chunkSize: 512,
            chunkOverlap: 50,
        });
    }

    async parse(fileBuffer: Buffer, job?: any): Promise<ParsingResult> {
        const data = await pdf(fileBuffer);
        const totalPages = data.numpages;
        let allChunks: Chunk[] = [];

        for (let i = 0; i < totalPages; i++) {
            const pageText = data.text.split('\n\n').filter(p => p.trim() !== '')[i] || '';
            const chunks = await this.textSplitter.splitText(pageText);

            chunks.forEach((chunkContent, chunkIndex) => {
                allChunks.push({
                    id: `page_${i + 1}_chunk_${chunkIndex}`,
                    content: chunkContent,
                    tokens: tokenizer.encode(chunkContent).length,
                    metadata: {
                        page_number: i + 1,
                        chunk_index: chunkIndex,
                    },
                });
            });

            if (job && typeof job.updateProgress === 'function') {
                await job.updateProgress(((i + 1) / totalPages) * 100);
            }
        }

        return {
            text: data.text,
            numPages: totalPages,
            numChunks: allChunks.length,
            chunks: allChunks,
        };
    }
}

export default PDFParser;