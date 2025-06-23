"use strict";
// @ts-nocheck - LangGraph 버전 호환성 문제로 타입 검사 비활성화
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeedbackWorkflow = void 0;
const openai_1 = require("@langchain/openai");
const zod_1 = require("zod");
const langgraph_1 = require("@langchain/langgraph");
const runnables_1 = require("@langchain/core/runnables");
const output_parsers_1 = require("@langchain/core/output_parsers");
const prompts_1 = require("@langchain/core/prompts");
const config_1 = require("../config");
const zod_2 = require("zod");
// Zod 스키마 정의
const InputSchema = zod_1.z.object({
    question_id: zod_1.z.string(),
    question_data: zod_1.z.any(),
    feedback: zod_1.z.string(),
    approved: zod_1.z.boolean().default(true),
    corrections: zod_1.z.record(zod_1.z.any()).optional(),
});
const OutputSchema = zod_1.z.object({
    question_id: zod_1.z.string(),
    updated_data: zod_1.z.any(),
    recommendations: zod_1.z.array(zod_1.z.string()).optional(),
    feedback_summary: zod_1.z.string().optional(),
    success: zod_1.z.boolean(),
    message: zod_1.z.string().optional(),
});
/**
 * 피드백 처리 워크플로우 클래스
 */
class FeedbackWorkflow {
    constructor() {
        // LLM 모델 초기화
        this.model = new openai_1.ChatOpenAI({
            modelName: config_1.LLM_CONFIG.questionGeneration.model,
            temperature: 0.2,
            maxTokens: 1024,
        });
        // 워크플로우 생성
        this.createWorkflow();
    }
    /**
     * 워크플로우 생성
     */
    createWorkflow() {
        // 노드 정의
        // @ts-ignore: StateGraph channel typing is too complex
        const builder = new langgraph_1.StateGraph({
            channels: {
                question_id: {
                    default: () => "",
                    reducer: (curr, update) => update || curr
                },
                question_data: {
                    default: () => null,
                    reducer: (curr, update) => update || curr
                },
                feedback: {
                    default: () => "",
                    reducer: (curr, update) => update || curr
                },
                approved: {
                    default: () => true,
                    reducer: (curr, update) => typeof update === 'boolean' ? update : (curr || true)
                },
                corrections: {
                    default: () => ({}),
                    reducer: (curr, update) => {
                        if (!curr || Object.keys(curr).length === 0)
                            return update;
                        if (!update || Object.keys(update).length === 0)
                            return curr;
                        return { ...curr, ...update };
                    }
                },
                updated_data: {
                    default: () => null,
                    reducer: (curr, update) => update || curr
                },
                feedback_summary: {
                    default: () => "",
                    reducer: (curr, update) => update || curr
                },
                recommendations: {
                    default: () => [],
                    reducer: (curr, update) => {
                        if (!curr)
                            return update || [];
                        if (!update)
                            return curr;
                        return [...curr, ...update];
                    }
                },
                error: {
                    default: () => undefined,
                    reducer: (curr, update) => update || curr
                }
            }
        });
        // 1. 피드백 분석 노드
        // @ts-ignore: LangGraph typing issues
        builder.addNode("analyzeFeedback", runnables_1.RunnableLambda.from(this.analyzeFeedbackNode()));
        // 2. 문제 업데이트 노드
        // @ts-ignore: LangGraph typing issues
        builder.addNode("updateQuestion", runnables_1.RunnableLambda.from(this.updateQuestionNode()));
        // 3. 개선 추천 노드
        // @ts-ignore: LangGraph typing issues
        builder.addNode("generateRecommendations", runnables_1.RunnableLambda.from(this.generateRecommendationsNode()));
        // 에러 핸들링 노드
        // @ts-ignore: LangGraph typing issues
        builder.addNode("handleError", runnables_1.RunnableLambda.from(this.handleErrorNode()));
        // 엣지 설정
        // @ts-ignore: LangGraph API has changed
        builder.addEdge("__start__", "analyzeFeedback");
        // @ts-ignore: LangGraph API has changed
        builder.addConditionalEdges("analyzeFeedback", (state) => {
            if (state.error)
                return "handleError";
            return state.approved ? "generateRecommendations" : "updateQuestion";
        });
        // @ts-ignore: LangGraph API has changed
        builder.addEdge("updateQuestion", "generateRecommendations");
        // @ts-ignore: LangGraph API has changed
        builder.addEdge("generateRecommendations", langgraph_1.END);
        // @ts-ignore: LangGraph API has changed
        builder.addEdge("handleError", langgraph_1.END);
        // 워크플로우 생성
        this.workflow = builder.compile();
    }
    /**
     * 피드백 분석 노드
     */
    analyzeFeedbackNode() {
        return async (state) => {
            try {
                if (!state.feedback) {
                    return {
                        ...state,
                        feedback_summary: "피드백이 없습니다.",
                    };
                }
                // 피드백 분석 프롬프트
                const template = `
        당신은 교육용 문제에 대한 피드백을 분석하는 전문가입니다.
        
        [문제 정보]
        {question_json}
        
        [피드백]
        {feedback}
        
        위 피드백을 분석하여 간결하게 요약해주세요. 피드백의 주요 포인트를 3줄 이내로 정리하세요.
        `;
                // Using ChatPromptTemplate instead of PromptTemplate to properly handle system messages
                const chatPrompt = prompts_1.ChatPromptTemplate.fromMessages([
                    ["system", template]
                ]);
                // @ts-ignore: Type compatibility issues between LangChain components
                const chain = chatPrompt.pipe(this.model).pipe(new output_parsers_1.StringOutputParser());
                const feedbackSummary = await chain.invoke({
                    question_json: JSON.stringify(state.question_data, null, 2),
                    feedback: state.feedback,
                });
                return {
                    ...state,
                    feedback_summary: feedbackSummary,
                };
            }
            catch (error) {
                console.error('피드백 분석 오류:', error);
                return {
                    ...state,
                    error: `피드백 분석 중 오류 발생: ${error.message}`,
                    feedback_summary: "피드백 분석 중 오류가 발생했습니다.",
                };
            }
        };
    }
    /**
     * 문제 업데이트 노드
     */
    updateQuestionNode() {
        return async (state) => {
            try {
                if (state.approved) {
                    // 승인된 경우 업데이트 없음
                    return {
                        ...state,
                        updated_data: state.question_data,
                    };
                }
                // 수정사항 있는 경우
                if (state.corrections && Object.keys(state.corrections).length > 0) {
                    // 수정사항 적용
                    const updatedData = {
                        ...state.question_data,
                        ...state.corrections,
                    };
                    return {
                        ...state,
                        updated_data: updatedData,
                    };
                }
                // 수정사항이 없지만 승인되지 않은 경우, LLM을 사용하여 자동 수정
                const template = `
        당신은 교육용 문제를 개선하는 전문가입니다.
        
        [문제 정보]
        {question_json}
        
        [피드백]
        {feedback}
        
        위 피드백을 바탕으로 문제를 개선해주세요. 개선된 문제를 원본과 동일한 JSON 형식으로 제공해주세요.
        전체 JSON만 제공하고 다른 설명은 하지 마세요.
        `;
                // Using ChatPromptTemplate instead of PromptTemplate to properly handle system messages
                const chatPrompt = prompts_1.ChatPromptTemplate.fromMessages([
                    ["system", template]
                ]);
                // @ts-ignore: Type compatibility issues between LangChain components
                const chain = chatPrompt.pipe(this.model).pipe(new output_parsers_1.StringOutputParser());
                const result = await chain.invoke({
                    question_json: JSON.stringify(state.question_data, null, 2),
                    feedback: state.feedback,
                });
                // JSON 파싱
                let jsonContent = result;
                if (result.includes('```json')) {
                    jsonContent = result.split('```json')[1].split('```')[0].trim();
                }
                else if (result.includes('```')) {
                    jsonContent = result.split('```')[1].split('```')[0].trim();
                }
                const updatedData = JSON.parse(jsonContent);
                return {
                    ...state,
                    updated_data: updatedData,
                };
            }
            catch (error) {
                console.error('문제 업데이트 오류:', error);
                return {
                    ...state,
                    error: `문제 업데이트 중 오류 발생: ${error.message}`,
                    updated_data: state.question_data, // 오류 시 원본 데이터 사용
                };
            }
        };
    }
    /**
     * 개선 추천 노드
     */
    generateRecommendationsNode() {
        return async (state) => {
            try {
                // 개선 추천 프롬프트
                const template = `
        당신은 교육용 문제를 개선하는 전문가입니다.
        
        [문제 정보]
        {question_json}
        
        [피드백]
        {feedback}
        
        위 문제에 대해 향후 개선할 수 있는 부분을 3가지 정도 제안해주세요. 
        각 제안은 한 문장으로 간결하게 작성해주세요.
        
        1. 
        2. 
        3. 
        `;
                // Using ChatPromptTemplate instead of PromptTemplate to properly handle system messages
                const chatPrompt = prompts_1.ChatPromptTemplate.fromMessages([
                    ["system", template]
                ]);
                // @ts-ignore: Type compatibility issues between LangChain components
                const chain = chatPrompt.pipe(this.model).pipe(new output_parsers_1.StringOutputParser());
                const recommendationsText = await chain.invoke({
                    question_json: JSON.stringify(state.updated_data || state.question_data, null, 2),
                    feedback: state.feedback,
                });
                // 결과 파싱
                const recommendations = recommendationsText
                    .split('\n')
                    .filter((line) => line.trim().startsWith('1.') || line.trim().startsWith('2.') || line.trim().startsWith('3.'))
                    .map((line) => line.trim());
                return {
                    ...state,
                    recommendations,
                };
            }
            catch (error) {
                console.error('개선 추천 생성 오류:', error);
                return {
                    ...state,
                    error: `개선 추천 생성 중 오류 발생: ${error.message}`,
                    recommendations: [],
                };
            }
        };
    }
    /**
     * 에러 핸들링 노드
     */
    handleErrorNode() {
        return (state) => {
            console.error('워크플로우 오류:', state.error);
            // 에러 메시지와 함께 기본 결과 생성
            return {
                ...state,
                updated_data: state.updated_data || state.question_data,
                recommendations: state.recommendations || [],
                feedback_summary: state.feedback_summary || "피드백 처리 중 오류가 발생했습니다.",
            };
        };
    }
    /**
     * 워크플로우 실행
     */
    async runWorkflow(input) {
        try {
            // 입력 검증
            const validatedInput = InputSchema.parse(input);
            // 초기 상태 설정
            const initialState = {
                question_id: validatedInput.question_id,
                question_data: validatedInput.question_data,
                feedback: validatedInput.feedback,
                approved: validatedInput.approved,
                corrections: validatedInput.corrections,
            };
            // 워크플로우 실행
            const result = await this.workflow.invoke(initialState);
            if (result.error) {
                console.error('워크플로우 실행 오류:', result.error);
            }
            // 결과 반환
            return OutputSchema.parse({
                question_id: result.question_id,
                updated_data: result.updated_data || result.question_data,
                recommendations: result.recommendations || [],
                feedback_summary: result.feedback_summary || '',
                success: !result.error,
                message: result.error || '피드백이 성공적으로 처리되었습니다.',
            });
        }
        catch (error) {
            console.error('워크플로우 실행 오류:', error);
            if (error instanceof zod_2.ZodError) {
                if (error.name === 'ZodError') {
                    throw new Error(`Zod validation error: ${error.errors.map(e => `${e.path.join('.')} - ${e.message}`).join(', ')}`);
                }
            }
            return OutputSchema.parse({
                question_id: '',
                updated_data: null,
                recommendations: [],
                feedback_summary: '피드백 처리 중 오류가 발생했습니다.',
                success: false,
                message: error.message || '피드백 처리 중 오류가 발생했습니다.',
            });
        }
    }
}
exports.FeedbackWorkflow = FeedbackWorkflow;
// 싱글톤 인스턴스 생성 및 기본 내보내기
const feedbackWorkflow = new FeedbackWorkflow();
exports.default = feedbackWorkflow;
