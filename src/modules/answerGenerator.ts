import OpenAI from 'openai';
import { API_CONFIG, LLM_CONFIG } from '../config';
import { Stream } from 'openai/streaming';

/**
 * RAG(검색 증강 생성)의 답변 생성 부분을 담당하는 클래스
 */
class AnswerGenerator {
  private openai: OpenAI;

  constructor() {
    if (!API_CONFIG.openaiApiKey) {
      throw new Error('OpenAI API key is not configured. Please set OPENAI_API_KEY in your environment variables.');
    }
    this.openai = new OpenAI({
      apiKey: API_CONFIG.openaiApiKey,
    });
  }

  /**
   * 검색된 컨텍스트와 사용자 질문을 기반으로 LLM에게 답변 생성을 요청하고,
   * 생성된 답변을 스트림 형태로 반환합니다.
   * @param query 사용자의 원본 질문
   * @param context 검색된 관련 문서 조각들의 내용
   * @returns OpenAI API의 응답 스트림
   */
  public async generateAnswerStream(query: string, context: string[]): Promise<Stream<OpenAI.Chat.Completions.ChatCompletionChunk>> {
    const contextString = context.map((c, i) => `[문서 ${i+1}]\n${c}`).join('\n\n---\n\n');

    const systemPrompt = `당신은 주어진 '문서'의 내용을 바탕으로 사용자의 '질문'에 대해 답변하는 AI 어시스턴트입니다.
- 반드시 주어진 '문서'의 내용에 근거하여 답변해야 합니다.
- 문서에 내용이 없으면 "제공된 문서의 내용만으로는 답변을 찾을 수 없습니다."라고 솔직하게 답변하세요.
- 답변은 한국어로, 친절하고 명확하게 설명해주세요.`;

    const userPrompt = `
[사용자 질문]
${query}

[문서]
${contextString}
`;

    try {
      const stream = await this.openai.chat.completions.create({
        model: LLM_CONFIG.answer.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: LLM_CONFIG.answer.temperature,
        max_tokens: LLM_CONFIG.answer.maxTokens,
        stream: true,
      });

      return stream;
    } catch (error) {
      console.error('Error generating answer from OpenAI:', error);
      throw new Error('Failed to generate answer from OpenAI.');
    }
  }
}

export default new AnswerGenerator(); 