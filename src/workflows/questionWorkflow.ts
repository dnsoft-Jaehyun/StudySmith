// @ts-nocheck - LangGraph 버전 호환성 문제로 타입 검사 비활성화

import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, END } from "@langchain/langgraph";
import { RunnableSequence, RunnableLambda } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { Question } from "../types";
import { LLM_CONFIG } from '../config';
import { vectorStoreManager } from '../modules/vectorStoreManager';

// 워크플로우 상태 타입 정의
type StateType = {
  subject?: string;
  grade?: string;
  chapter_title?: string;
  lesson_title?: string;
  keywords?: string[];
  question_type?: string;
  difficulty?: string;
  num_questions?: number;
  pdf_id?: string;
  
  // 중간 상태
  reference_documents?: any[];
  generated_questions?: Question[];
  validated_questions?: Question[];
  final_questions?: Question[];
  
  // 오류 처리
  error?: string;
  last_error_message?: string;
};

/**
 * 문제 생성 워크플로우 클래스
 */
export class QuestionWorkflow {
  private model: ChatOpenAI;
  private workflow: any;

  // 이미 사용된 문서 청크 추적용
  private usedDocumentIds: Set<string> = new Set();
  private documentUsageMap: Map<string, number> = new Map(); // 문서별 사용 횟수 추적

  constructor() {
    // LLM 모델 초기화
    this.model = new ChatOpenAI({
      modelName: LLM_CONFIG.questionGeneration.model,
      temperature: LLM_CONFIG.questionGeneration.temperature,
      maxTokens: LLM_CONFIG.questionGeneration.maxTokens,
    });

    // 워크플로우 생성
    this.createWorkflow();
  }

  /**
   * 워크플로우 생성
   */
  private createWorkflow() {
    // @ts-ignore: StateGraph channel typing is too complex
    const builder = new StateGraph<StateType>({
      channels: {
        subject: { default: () => "", reducer: (curr: string, update: string) => update || curr },
        grade: { default: () => "", reducer: (curr: string, update: string) => update || curr },
        chapter_title: { default: () => "", reducer: (curr: string, update: string) => update || curr },
        lesson_title: { default: () => "", reducer: (curr: string, update: string) => update || curr },
        keywords: { default: () => [], reducer: (curr: string[], update: string[]) => update || curr },
        question_type: { default: () => "객관식", reducer: (curr: string, update: string) => update || curr },
        difficulty: { default: () => "중", reducer: (curr: string, update: string) => update || curr },
        num_questions: { default: () => 5, reducer: (curr: number, update: number) => update || curr },
        pdf_id: { default: () => "", reducer: (curr: string, update: string) => update || curr },
        
        reference_documents: { default: () => [], reducer: (curr: any[], update: any[]) => update || curr },
        generated_questions: { default: () => [], reducer: (curr: Question[], update: Question[]) => update || curr },
        validated_questions: { default: () => [], reducer: (curr: Question[], update: Question[]) => update || curr },
        final_questions: { default: () => [], reducer: (curr: Question[], update: Question[]) => update || curr },
        
        error: { default: () => undefined, reducer: (curr: string, update: string) => update || curr },
        last_error_message: { default: () => undefined, reducer: (curr: string, update: string) => update || curr }
      }
    });

    // 1. 문서 검색 노드
    builder.addNode("searchDocuments", RunnableLambda.from(this.searchDocumentsNode()));
    
    // 2. 문제 생성 노드  
    builder.addNode("generateQuestions", RunnableLambda.from(this.generateQuestionsNode()));
    
    // 3. 힌트/해설 생성 노드 - 이미 문제 생성 시 포함되므로 간소화
    builder.addNode("generateHintExplanation", RunnableLambda.from(this.generateHintExplanationNode()));
    
    // 4. 중복 제거 노드 - 개선된 중복 감지
    builder.addNode("deduplicateQuestions", RunnableLambda.from(this.deduplicateQuestionsNode()));
    
    // 5. 최종 검증 노드 - 요청된 수량 보장
    builder.addNode("validateQuestions", RunnableLambda.from(this.validateQuestionsNode()));
    
    // 6. 오류 처리 노드
    builder.addNode("handleError", RunnableLambda.from(this.handleErrorNode()));

    // 엣지 설정
    builder.addEdge("__start__", "searchDocuments");
    
    builder.addConditionalEdges("searchDocuments", (state: StateType) => {
      if (state.error) return "handleError";
      return "generateQuestions";
    });
    
    builder.addConditionalEdges("generateQuestions", (state: StateType) => {
      if (state.error) return "handleError";
      return "generateHintExplanation";
    });
    
    builder.addEdge("generateHintExplanation", "deduplicateQuestions");
    builder.addEdge("deduplicateQuestions", "validateQuestions");
    builder.addEdge("validateQuestions", END);
    builder.addEdge("handleError", END);

    // 워크플로우 컴파일
    this.workflow = builder.compile();
  }

  /**
   * 1. 문서 검색 노드 - 다양성 확보
   */
  private searchDocumentsNode() {
    return async (state: StateType): Promise<StateType> => {
      try {
        console.log("📚 [문서 검색] 다양성 검색 시작");
        
        // 가장 최근 컬렉션 찾기
        const collections = await vectorStoreManager.listCollections();
        console.log(`📂 [문서 검색] 사용 가능한 컬렉션: ${collections.map(c => c.name).join(', ')}`);
        
        const docCollections = collections.filter(c => c.name.startsWith('collection_doc_'));
        
        if (docCollections.length === 0) {
          console.log("⚠️ [문서 검색] 문서 컬렉션이 없어 샘플 참고 자료 생성");
          const sampleDocument = `${state.subject} ${state.grade}학년 ${state.chapter_title} ${state.lesson_title}에 대한 기본 교육 내용입니다. 이 단원에서는 학생들이 기초적인 개념을 이해하고 실제 문제를 해결할 수 있도록 돕는 것이 목표입니다.`;
          
          return {
            ...state,
            reference_documents: [sampleDocument]
          };
        }
        
        const latestCollection = docCollections.sort((a, b) => b.name.localeCompare(a.name))[0];
        console.log(`📂 [문서 검색] 검색 대상 컬렉션: ${latestCollection.name}`);
        
        // 메타데이터 필터 구성
        const metadataFilter: Record<string, any> = {};
        if (state.subject) metadataFilter.subject = state.subject;
        if (state.grade) metadataFilter.grade = state.grade;
        
        // 다양한 관점의 검색 쿼리 생성
        const searchQueries = this.generateDiverseSearchQueries(state);
        console.log(`🔍 [문서 검색] 생성된 검색 쿼리: ${searchQueries.length}개`);
        
        // 카테고리별 다양성 검색 실행
        const diverseDocuments = await vectorStoreManager.categoryDiversitySearch(
          latestCollection.name,
          searchQueries,
          Math.min(15, state.num_questions * 3), // 문제 수의 3배 정도
          Array.from(this.usedDocumentIds), // 이미 사용된 문서 제외
          metadataFilter
        );
        
        console.log(`📋 [문서 검색] 다양성 검색 결과: ${diverseDocuments.length}개`);
        
        // 검색된 문서 정보 로깅
        diverseDocuments.forEach((doc, index) => {
          const docId = doc.metadata.id || `unknown_${index}`;
          const usageCount = this.documentUsageMap.get(docId) || 0;
          console.log(`  📄 문서 ${index + 1}: ID=${docId}, 사용횟수=${usageCount}, 길이=${doc.pageContent.length}자`);
        });
        
        // 검색 결과가 부족한 경우 보완 검색
        let finalDocuments = diverseDocuments;
        if (diverseDocuments.length < state.num_questions) {
          console.log(`🔄 [문서 검색] 결과 부족 (${diverseDocuments.length}/${state.num_questions}), 보완 검색 실행`);
          
          const fallbackQuery = `${state.subject} ${state.grade}학년 ${state.chapter_title} ${state.lesson_title} 학습 내용 개념 설명`;
          const fallbackDocs = await vectorStoreManager.diversitySearch(
            latestCollection.name,
            fallbackQuery,
            state.num_questions - diverseDocuments.length,
            0.5, // 다양성 우선
            Array.from(this.usedDocumentIds),
            metadataFilter
          );
          
          finalDocuments = [...diverseDocuments, ...fallbackDocs];
          console.log(`🔄 [문서 검색] 보완 후 총 ${finalDocuments.length}개 문서`);
        }
        
        // 문서가 여전히 없는 경우 기본 문서 제공
        if (finalDocuments.length === 0) {
          console.log("⚠️ [문서 검색] 검색 결과 없음, 기본 문서 생성");
          const fallbackDocument = `${state.subject} ${state.grade}학년 ${state.chapter_title} ${state.lesson_title}에 대한 기본 학습 내용입니다.`;
          finalDocuments = [{ content: fallbackDocument, metadata: {} }];
        }
        
        // 문서 내용을 문자열 배열로 변환
        const documents = finalDocuments.map(doc => 
          typeof doc === 'string' ? doc : doc.content || doc.pageContent || doc
        );
        
        console.log(`✅ [문서 검색] 완료: ${documents.length}개 문서 반환`);
        
        return {
          ...state,
          reference_documents: documents
        };
        
      } catch (error: any) {
        console.error("❌ [문서 검색] 오류:", error);
        
        const fallbackDocument = `${state.subject} ${state.grade}학년 교육 내용에 대한 기본 참고 자료입니다.`;
        
        return {
          ...state,
          error: error.message || "문서 검색 중 오류 발생",
          reference_documents: [fallbackDocument]
        };
      }
    };
  }

  /**
   * 다양한 관점의 검색 쿼리 생성
   */
  private generateDiverseSearchQueries(state: StateType): Array<{ query: string, category: string, weight?: number }> {
    const baseInfo = `${state.subject} ${state.grade}학년 ${state.chapter_title} ${state.lesson_title}`;
    
    const queries = [
      {
        query: `${baseInfo} 기본 개념 정의 용어 설명`,
        category: '기본 개념',
        weight: 1.5 // 기본 개념에 더 많은 가중치
      },
      {
        query: `${baseInfo} 실험 활동 실습 방법 과정`,
        category: '실험/실습',
        weight: 1.2
      },
      {
        query: `${baseInfo} 원리 법칙 현상 이론`,
        category: '원리/이론',
        weight: 1.0
      },
      {
        query: `${baseInfo} 예시 사례 적용 활용`,
        category: '예시/적용',
        weight: 1.0
      },
      {
        query: `${baseInfo} 비교 차이점 특징 구분`,
        category: '비교/분석',
        weight: 0.8
      },
      {
        query: `${baseInfo} 문제 해결 방법 해답`,
        category: '문제해결',
        weight: 0.8
      },
      {
        query: `${baseInfo} 관계 연결 상호작용 영향`,
        category: '관계/연결',
        weight: 0.7
      }
    ];
    
    // 키워드가 있는 경우 키워드 기반 쿼리 추가
    if (state.keywords && state.keywords.length > 0) {
      state.keywords.forEach(keyword => {
        queries.push({
          query: `${baseInfo} ${keyword} 관련 내용`,
          category: '키워드 특화',
          weight: 0.9
        });
      });
    }
    
    return queries;
  }

  /**
   * 2. 문제 생성 노드 - 워크플로우용 (진행률 콜백 없음)
   */
  private generateQuestionsNode() {
    return async (state: StateType): Promise<StateType> => {
      try {
        console.log("🎯 [문제 생성] 다양성 검색 시작");
        
        const numQuestions = state.num_questions || 5;
        const questions: Question[] = [];
        
        // 워크플로우 시작 시 사용된 문서 추적 초기화
        this.usedDocumentIds.clear();
        this.documentUsageMap.clear();
        
        console.log("📊 [문제 생성] 문서 내용 분석 중...");
        
        // 문서 내용에서 핵심 개념과 세부 사실들을 추출
        const allReferenceText = state.reference_documents
          ?.slice(0, 10) // 최대 10개 문서 사용
          ?.map(doc => doc.content || doc)
          ?.join('\n\n') || '';
        
        const documentAnalysis = await this.analyzeDocumentContent(allReferenceText, state);
        
        // 다양한 문제 유형과 관점 정의
        const questionTypes = [
          {
            type: '기본 이해',
            focus: '문서에 명시된 구체적인 정보와 수치',
            instruction: '문서에서 언급된 정확한 사실, 수치, 지명, 용어를 묻는 문제',
            searchStrategy: 'specific_facts'
          },
          {
            type: '개념 이해',
            focus: '핵심 개념의 정의와 특징',
            instruction: '문서에서 설명된 주요 개념의 의미와 특성을 묻는 문제',
            searchStrategy: 'concepts'
          },
          {
            type: '관계 분석',
            focus: '요소들 간의 관계와 상호작용',
            instruction: '문서에서 언급된 여러 요소들 사이의 관계, 원인과 결과를 묻는 문제',
            searchStrategy: 'relationships'
          },
          {
            type: '적용 실습',
            focus: '학습 내용의 실생활 적용',
            instruction: '문서 내용을 실제 상황에 적용하거나 예시를 찾는 문제',
            searchStrategy: 'applications'
          },
          {
            type: '비교 분석',
            focus: '여러 대상의 차이점과 공통점',
            instruction: '문서에서 제시된 여러 대상이나 개념을 비교하여 차이점을 묻는 문제',
            searchStrategy: 'comparisons'
          },
          {
            type: '종합 판단',
            focus: '여러 정보를 종합한 판단',
            instruction: '문서의 여러 내용을 종합하여 결론을 도출하거나 판단을 요구하는 문제',
            searchStrategy: 'synthesis'
          },
          {
            type: '문제 해결',
            focus: '주어진 상황에서의 해결 방안',
            instruction: '문서 내용을 바탕으로 특정 문제 상황의 해결책을 찾는 문제',
            searchStrategy: 'problem_solving'
          },
          {
            type: '추론 사고',
            focus: '주어진 정보로부터의 추론',
            instruction: '문서에 직접 명시되지 않았지만 내용으로부터 추론할 수 있는 것을 묻는 문제',
            searchStrategy: 'inference'
          }
        ];

        // 개별 문제 생성 - 다양성 확보
        // 사용된 유형 추적 (균등 분배를 위해)
        const usedQuestionTypes: string[] = [];
        
        for (let i = 0; i < numQuestions; i++) {
          // 스마트 유형 선택: 균등 분배 + 랜덤성
          let questionType;
          let attempts = 0;
          const maxAttempts = 10;
          
          do {
            const randomIndex = Math.floor(Math.random() * questionTypes.length);
            questionType = questionTypes[randomIndex];
            attempts++;
            
            // 이미 많이 사용된 유형은 피하기 (균등 분배)
            const typeUsageCount = usedQuestionTypes.filter(type => type === questionType.type).length;
            const maxUsagePerType = Math.ceil(numQuestions / questionTypes.length) + 1;
            
            if (typeUsageCount < maxUsagePerType || attempts >= maxAttempts) {
              break;
            }
          } while (attempts < maxAttempts);
          
          usedQuestionTypes.push(questionType.type);
          
          console.log(`🎯 [문제 생성] ${i + 1}/${numQuestions}번째 문제 생성 중... (${questionType.type}) [스마트 선택]`);
          
          try {
            // 각 문제 유형별로 특화된 문서 검색
            const specificDocuments = await this.getDocumentsForQuestionType(
              state, 
              questionType.searchStrategy, 
              i + 1
            );
            
            const referenceText = specificDocuments
              .slice(0, 3) // 각 문제당 최대 3개 문서 사용
              .map(doc => typeof doc === 'string' ? doc : doc.content || doc.pageContent || doc)
              .join('\n\n');
            
            if (!referenceText.trim()) {
              console.log(`⚠️ [문제 생성] ${i + 1}번째 문제: 참고 문서 없음, 일반 문서 사용`);
              const fallbackText = allReferenceText.slice(0, 2000);
              if (!fallbackText.trim()) {
                console.log(`❌ [문제 생성] ${i + 1}번째 문제: 참고 자료 부족으로 건너뜀`);
                continue;
              }
            }
            
            // 사용된 문서들을 추적에 추가
            specificDocuments.forEach(doc => {
              const docId = (typeof doc === 'object' && doc.metadata?.id) || `doc_${Date.now()}_${Math.random()}`;
              this.usedDocumentIds.add(docId);
              this.documentUsageMap.set(docId, (this.documentUsageMap.get(docId) || 0) + 1);
            });
            
            // 각 문제 유형별로 문제 생성
            const questionId = `q_${Date.now()}_${i}`;
            
            // 문제 생성 프롬프트 구성
            const questionPrompt = `
당신은 ${state.subject} 교육 전문가입니다. 다음 조건에 맞는 ${questionType.type} 문제를 생성해주세요.

[교육 정보]
- 교과: ${state.subject}
- 학년: ${state.grade}학년
- 단원: ${state.chapter_title}
- 차시: ${state.lesson_title}
- 문제 유형: ${state.question_type}
- 난이도: ${state.difficulty || '중'}
- 문제 번호: ${i + 1}/${state.num_questions}

[참고 자료]
${referenceText}

**🚨 과학적 정확성 필수 확인:**
- ✅ **낮과 밤**: 지구의 **자전** 때문 (절대 공전 아님!)
- ✅ **계절**: 지구의 **공전**과 지축 기울어짐 때문
- ✅ **달의 위상**: 달의 **공전**과 위치관계 때문
- ❌ **절대 금지**: "공전으로 인한 낮과 밤" - 완전히 틀린 설명
- ❌ **잘못된 패턴**: "공전함에 따라", "공전함으로써", "공전함과 같은" 표현 금지

**난이도별 문제 생성 기준:**
- **하**: 기본 개념 암기, 단순 사실 확인
- **중**: 개념 이해와 적용, 관계 분석  
- **상**: 종합적 사고, 창의적 적용

**문제 작성 지침:**
- "문서에서", "교과서에서", "6학년 과학 시간에" 등의 불필요한 표현은 사용하지 마세요
- 문제 내용에 직접적으로 집중하여 자연스럽게 작성하세요
- 기존 문제들과 중복되지 않는 새로운 관점의 문제를 생성하세요
- **과학 문제는 교과서의 정확한 개념만 사용하세요**

**🚫 절대 금지: 연달아 질문하는 형식**
- 하나의 문제에는 반드시 하나의 질문만 포함하세요
- "그리고", "또한", "아울러" 등으로 추가 질문을 연결하지 마세요
- 예시: ❌ "지구의 자전이란 무엇입니까? 그리고 자전 주기는 얼마나 됩니까?"
- 올바른 예시: ✅ "지구의 자전 주기는 얼마입니까?"

**어투 및 문체 지침:**
- 부드럽고 친근한 존댓말을 사용하세요: "~습니다", "~인가요?", "~일까요?"
- 학생들이 편안하게 느낄 수 있는 교실 대화체를 사용하세요
- 딱딱하고 권위적인 표현보다는 따뜻하고 격려하는 어투를 사용하세요

**어투 예시:**
- "다음 중 바르게 설명한 것은 무엇인가요?"
- "그림을 보고 어떤 생각이 드시나요?"
- "이 현상이 일어나는 이유는 무엇일까요?"
- "두 가지의 공통점은 무엇입니까?"

현재 설정된 난이도 '${state.difficulty || '중'}'에 맞는 문제를 생성하세요.

반드시 다음 형식으로 응답해주세요:

[문제] 
(구체적인 문제 내용 - 부드러운 존댓말 사용)

[선택지]
1) 첫 번째 선택지
2) 두 번째 선택지
3) 세 번째 선택지
4) 네 번째 선택지

[정답] 
정답 번호와 내용

[힌트]
문제 해결에 도움이 되는 힌트 (부드러운 어투로)

[해설]
정답에 대한 자세한 설명 (친근한 어투로)
`;

            const response = await this.model.invoke(questionPrompt);
            const result = response.content || response;

            // 결과 파싱
            const questionMatch = result.match(/\[문제\]\s*([\s\S]*?)(?=\[선택지\]|\[정답\])/);
            const optionsMatch = result.match(/\[선택지\]\s*([\s\S]*?)(?=\[정답\])/);
            const answerMatch = result.match(/\[정답\]\s*([\s\S]*?)(?=\[힌트\])/);
            const hintMatch = result.match(/\[힌트\]\s*([\s\S]*?)(?=\[해설\])/);
            const explanationMatch = result.match(/\[해설\]\s*([\s\S]*?)$/);
            
            let questionText = questionMatch ? questionMatch[1].trim() : `${state.subject} ${state.grade}학년 추가 문제 ${i + 1}`;
            let answer = answerMatch ? answerMatch[1].trim() : '정답';
            let hint = hintMatch ? hintMatch[1].trim() : `${state.chapter_title}의 핵심 개념을 떠올려보세요.`;
            let explanation = explanationMatch ? explanationMatch[1].trim() : `이 문제는 ${state.subject}의 중요한 개념을 다루고 있습니다. 차근차근 생각해보시면 답을 찾을 수 있을 거예요.`;
            
            // 선택지 파싱
            let options: string[] = [];
            if (optionsMatch && state.question_type === '객관식') {
              const optionsText = optionsMatch[1].trim();
              const optionLines = optionsText.split('\n').filter(line => line.trim());
              
              options = optionLines.map(line => {
                return line.replace(/^\d+\)\s*/, '').trim();
              }).filter(opt => opt.length > 0);
              
              // 정답 번호 파싱 (예: "1) 첫 번째 정답" 형식)
              const answerNumberMatch = answer.match(/^(\d+)\)/);
              if (answerNumberMatch && options.length > 0) {
                const answerIndex = parseInt(answerNumberMatch[1]) - 1;
                if (answerIndex >= 0 && answerIndex < options.length) {
                  answer = options[answerIndex];
                }
              }
            }
            
            // 기본값 설정 (파싱 실패 시)
            if (options.length === 0 && state.question_type === '객관식') {
              options = [
                `${state.chapter_title}의 첫 번째 특징`,
                `${state.chapter_title}의 두 번째 특징`, 
                `${state.chapter_title}의 세 번째 특징`,
                answer || '올바른 답'
              ];
            }

            const question: Question = {
              id: questionId,
              question: questionText,
              answer: answer,
              options: options,
              hint: hint,
              explanation: explanation,
              metadata: {
                subject: state.subject || '',
                grade: state.grade || '',
                chapter_title: state.chapter_title || '',
                lesson_title: state.lesson_title || '',
                question_type: state.question_type || '객관식',
                difficulty: state.difficulty || '중',
                questionType: questionType.type,
                fileName: state.pdf_id || 'unknown',
                generated_at: new Date().toISOString()
              }
            };
            
            questions.push(question);
            console.log(`✅ [문제 생성] ${questionType.type} 문제 '${question.id}' 생성 완료`);
            
          } catch (error: any) {
            console.error(`❌ [문제 생성] 문제 ${i + 1} 생성 실패:`, error);
            // 실패해도 계속 진행
          }
        }
        
        console.log(`🎯 [문제 생성] 완료: ${questions.length}개 문제 생성`);
        console.log(`📊 [문서 사용 통계] 총 ${this.usedDocumentIds.size}개 고유 문서 사용`);
        
        return { ...state, generated_questions: questions };
        
      } catch (error: any) {
        console.error("❌ [문제 생성] 전체 오류:", error);
        return {
          ...state,
          error: error.message || "문제 생성 중 오류 발생",
          generated_questions: []
        };
      }
    };
  }

  /**
   * 문제 유형별 특화 문서 검색
   */
  private async getDocumentsForQuestionType(
    state: StateType, 
    searchStrategy: string, 
    questionNumber: number
  ): Promise<any[]> {
    try {
      // 사용자 입력 정보 기반 검색 쿼리 생성
      const baseInfo = `${state.subject} ${state.grade}학년`;
      
      // 사용자가 입력한 정보 우선 사용
      const userChapterTitle = state.chapter_title && !state.chapter_title.includes('단원') ? state.chapter_title : '';
      const userLessonTitle = state.lesson_title && !state.lesson_title.includes('차시') ? state.lesson_title : '';
      
      // 키워드가 있으면 키워드 중심으로 검색
      let searchQuery = '';
      
      if (state.keywords && state.keywords.length > 0) {
        const keywordContext = state.keywords.join(' ');
        switch (searchStrategy) {
          case 'specific_facts':
            searchQuery = `${baseInfo} ${keywordContext} 정확한 수치 데이터 사실 정보`;
            break;
          case 'concepts':
            searchQuery = `${baseInfo} ${keywordContext} 개념 정의 의미 특성`;
            break;
          case 'relationships':
            searchQuery = `${baseInfo} ${keywordContext} 관계 상호작용 영향`;
            break;
          case 'applications':
            searchQuery = `${baseInfo} ${keywordContext} 적용 활용 실생활 예시`;
            break;
          case 'comparisons':
            searchQuery = `${baseInfo} ${keywordContext} 비교 차이점 공통점`;
            break;
          case 'synthesis':
            searchQuery = `${baseInfo} ${keywordContext} 종합 결론 판단`;
            break;
          case 'problem_solving':
            searchQuery = `${baseInfo} ${keywordContext} 문제 해결 방법`;
            break;
          case 'inference':
            searchQuery = `${baseInfo} ${keywordContext} 추론 예측 분석`;
            break;
          default:
            searchQuery = `${baseInfo} ${keywordContext}`;
        }
      } else if (userChapterTitle || userLessonTitle) {
        // 사용자가 입력한 단원/차시 제목 활용
        const userContext = `${userChapterTitle} ${userLessonTitle}`.trim();
        switch (searchStrategy) {
          case 'specific_facts':
            searchQuery = `${baseInfo} ${userContext} 정확한 수치 데이터 사실`;
            break;
          case 'concepts':
            searchQuery = `${baseInfo} ${userContext} 개념 정의 의미`;
            break;
          case 'relationships':
            searchQuery = `${baseInfo} ${userContext} 관계 상호작용`;
            break;
          case 'applications':
            searchQuery = `${baseInfo} ${userContext} 적용 활용 예시`;
            break;
          case 'comparisons':
            searchQuery = `${baseInfo} ${userContext} 비교 차이점`;
            break;
          case 'synthesis':
            searchQuery = `${baseInfo} ${userContext} 종합 결론`;
            break;
          case 'problem_solving':
            searchQuery = `${baseInfo} ${userContext} 문제 해결`;
            break;
          case 'inference':
            searchQuery = `${baseInfo} ${userContext} 추론 분석`;
            break;
          default:
            searchQuery = `${baseInfo} ${userContext}`;
        }
      } else {
        // 일반적인 검색 (기존 방식)
        switch (searchStrategy) {
          case 'specific_facts':
            searchQuery = `${baseInfo} 정확한 수치 데이터 사실 정보 측정값`;
            break;
          case 'concepts':
            searchQuery = `${baseInfo} 개념 정의 의미 특성 원리`;
            break;
          case 'relationships':
            searchQuery = `${baseInfo} 관계 상호작용 영향 연결 인과관계`;
            break;
          case 'applications':
            searchQuery = `${baseInfo} 적용 활용 실생활 예시 사례`;
            break;
          case 'comparisons':
            searchQuery = `${baseInfo} 비교 차이점 공통점 구분 대조`;
            break;
          case 'synthesis':
            searchQuery = `${baseInfo} 종합 결론 판단 평가 요약`;
            break;
          case 'problem_solving':
            searchQuery = `${baseInfo} 문제 해결 방법 해답 과정 절차`;
            break;
          case 'inference':
            searchQuery = `${baseInfo} 추론 예측 분석 결과 추정`;
            break;
          default:
            searchQuery = baseInfo;
        }
      }
      
      console.log(`🔍 [특화 검색] 문제 ${questionNumber} (${searchStrategy}): "${searchQuery}"`);
      
      // 최신 컬렉션 찾기
      const collections = await vectorStoreManager.listCollections();
      const docCollections = collections.filter(c => c.name.startsWith('collection_doc_'));
      
      if (docCollections.length === 0) {
        return state.reference_documents || [];
      }
      
      const latestCollection = docCollections.sort((a, b) => b.name.localeCompare(a.name))[0];
      
      // 메타데이터 필터
      const metadataFilter: Record<string, any> = {};
      if (state.subject) metadataFilter.subject = state.subject;
      if (state.grade) metadataFilter.grade = state.grade;
      
      // 다양성 검색 수행 (이미 사용된 문서 제외)
      const documents = await vectorStoreManager.diversitySearch(
        latestCollection.name,
        searchQuery,
        3, // 문제당 최대 3개 문서
        0.7, // 관련성 우선 (λ=0.7)
        Array.from(this.usedDocumentIds), // 이미 사용된 문서 제외
        metadataFilter
      );
      
      console.log(`📋 [특화 검색] 문제 ${questionNumber}: ${documents.length}개 문서 선택`);
      
      return documents.length > 0 ? documents : (state.reference_documents || []).slice(0, 3);
      
    } catch (error) {
      console.error(`❌ [특화 검색] 문제 ${questionNumber} 검색 실패:`, error);
      return (state.reference_documents || []).slice(0, 3);
    }
  }

  /**
   * 3. 힌트/해설 생성 노드 - 이미 문제 생성 시 포함되므로 간소화
   */
  private generateHintExplanationNode() {
    return async (state: StateType): Promise<StateType> => {
      try {
        console.log("💡 [힌트/해설 생성] 시작");
        
        const questions = state.generated_questions || [];
        if (questions.length === 0) {
          return { ...state };
        }
        
        // 이미 문제 생성 시 힌트와 해설이 포함되어 있으므로
        // 누락된 것만 보완
        const enhancedQuestions = questions.map(question => ({
          ...question,
          hint: question.hint || `${question.question}과 관련된 핵심 개념을 다시 한번 떠올려보세요.`,
          explanation: question.explanation || `정답은 '${question.answer}'입니다. 이는 ${state.subject} ${state.grade}학년 과정에서 중요한 내용이에요. 차근차근 생각해보시면 이해할 수 있을 거예요.`
        }));
        
        console.log(`✅ [힌트/해설 생성] ${enhancedQuestions.length}개 문제 처리 완료`);
        
        return {
          ...state,
          generated_questions: enhancedQuestions
        };
        
      } catch (error: any) {
        console.error("❌ [힌트/해설 생성] 오류:", error);
        return {
          ...state,
          error: error.message || "힌트/해설 생성 중 오류 발생"
        };
      }
    };
  }

  /**
   * 4. 중복 제거 노드 - 개선된 중복 감지
   */
  private deduplicateQuestionsNode() {
    return async (state: StateType): Promise<StateType> => {
      try {
        console.log("🔄 [중복 제거] 시작");
        
        const questions = state.generated_questions || [];
        if (questions.length === 0) {
          return { ...state, validated_questions: [] };
        }
        
        // 개선된 중복 제거 로직
        const uniqueQuestions: Question[] = [];
        
        for (const question of questions) {
          let isDuplicate = false;
          
          // 기존 문제들과 비교
          for (const existingQuestion of uniqueQuestions) {
            // 1. 완전히 동일한 문제 텍스트
            if (question.question === existingQuestion.question) {
              isDuplicate = true;
              break;
            }
            
            // 2. 유사도 검사 (간단한 키워드 기반)
            const similarity = this.calculateSimilarity(question.question, existingQuestion.question);
            if (similarity > 0.8) { // 80% 이상 유사하면 중복으로 판단
              console.log(`🔄 [중복 제거] 유사 문제 발견 (유사도: ${Math.round(similarity * 100)}%)`);
              isDuplicate = true;
              break;
            }
            
            // 3. 정답이 동일하고 문제 구조가 비슷한 경우
            if (question.answer === existingQuestion.answer && 
                question.options && existingQuestion.options &&
                question.options.length === existingQuestion.options.length) {
              const optionSimilarity = this.calculateOptionsSimilarity(question.options, existingQuestion.options);
              if (optionSimilarity > 0.7) {
                console.log(`🔄 [중복 제거] 유사 선택지 구조 발견`);
                isDuplicate = true;
                break;
              }
            }
          }
          
          if (!isDuplicate) {
            // 1. 연달아 질문 형식 검증
            const questionValidation = this.validateSingleQuestion(question.question);
            console.log(`🔍 [질문 형식] ${question.id || 'unknown'}: ${questionValidation.report}`);
            
            if (!questionValidation.isValid) {
              console.log(`🚫 [질문 형식] 부적절한 문제 제거: "${question.question.substring(0, 50)}..."`);
              continue; // 이 문제는 건너뛰기
            }
            
            // 2. 선택지 길이 균형 검증 및 조정 (객관식만)
            const questionType = question.metadata?.question_type || question.type || '객관식';
            if (questionType === '객관식' && question.options && question.options.length > 0) {
              const balanceCheck = this.validateOptionsBalance(question.options);
              console.log(`📏 [선택지 균형] ${question.id || 'unknown'}: ${balanceCheck.report}`);
              
              if (!balanceCheck.isBalanced) {
                // 선택지 길이 자동 조정
                const adjustedOptions = this.adjustOptionsBalance(question.options, question.question);
                const adjustedBalanceCheck = this.validateOptionsBalance(adjustedOptions);
                
                if (adjustedBalanceCheck.isBalanced) {
                  console.log(`🔧 [선택지 조정] 성공: ${adjustedBalanceCheck.report}`);
                  question.options = adjustedOptions;
                } else {
                  console.log(`⚠️ [선택지 조정] 실패: ${adjustedBalanceCheck.report}`);
                }
              }
            }
            
            uniqueQuestions.push(question);
          } else {
            console.log(`🔄 [중복 제거] 중복 문제 제거: "${question.question.substring(0, 50)}..."`);
          }
        }
        
        console.log(`🔄 [중복 제거] ${questions.length}개 -> ${uniqueQuestions.length}개`);
        
        return {
          ...state,
          validated_questions: uniqueQuestions
        };
        
      } catch (error: any) {
        console.error("❌ [중복 제거] 오류:", error);
        return {
          ...state,
          error: error.message || "중복 제거 중 오류 발생",
          validated_questions: state.generated_questions || []
        };
      }
    };
  }

  /**
   * 5. 최종 검증 노드 - 요청된 수량 보장
   */
  private validateQuestionsNode() {
    return async (state: StateType): Promise<StateType> => {
      try {
        console.log("✅ [최종 검증] 시작");
        
        const questions = state.validated_questions || [];
        const requestedCount = state.num_questions || 5;
        console.log(`📊 [최종 검증] 현재 문제 수: ${questions.length}, 요청 수: ${requestedCount}`);
        
        // 수량이 부족한 경우 추가 생성
        if (questions.length < requestedCount) {
          const shortage = requestedCount - questions.length;
          console.log(`⚠️ [최종 검증] ${shortage}개 문제 부족. 추가 생성 시작...`);
          
          const additionalQuestions: Question[] = [];
          
          // 참고 문서 텍스트 준비
          const referenceText = state.reference_documents
            ?.slice(0, 3)
            ?.map(doc => doc.content || doc)
            ?.join('\n\n') || '';
          
          // 부족한 만큼 추가 생성
          for (let i = 0; i < shortage; i++) {
            try {
              const template = `
당신은 경험이 풍부한 교육 전문가입니다. 다음 교육 정보를 바탕으로 완성도 높은 문제를 생성해주세요.

[교육 정보]
- 과목: {subject}
- 학년: {grade}학년  
- 단원: {chapter_title}
- 차시: {lesson_title}
- 문제 유형: {question_type}
- **난이도: {difficulty_level}**
- 추가 생성 번호: {additional_number}

[참고 자료]
{reference_text}

**🚨 과학적 정확성 필수 확인:**
- ✅ **낮과 밤**: 지구의 **자전** 때문 (절대 공전 아님!)
- ✅ **계절**: 지구의 **공전**과 지축 기울어짐 때문
- ✅ **달의 위상**: 달의 **공전**과 위치관계 때문
- ❌ **절대 금지**: "공전으로 인한 낮과 밤" - 완전히 틀린 설명
- ❌ **잘못된 패턴**: "공전함에 따라", "공전함으로써", "공전함과 같은" 표현 금지

**난이도별 문제 생성 기준:**
- **하**: 기본 개념 암기, 단순 사실 확인
- **중**: 개념 이해와 적용, 관계 분석  
- **상**: 종합적 사고, 창의적 적용

**문제 작성 지침:**
- "문서에서", "교과서에서", "6학년 과학 시간에" 등의 불필요한 표현은 사용하지 마세요
- 문제 내용에 직접적으로 집중하여 자연스럽게 작성하세요
- 기존 문제들과 중복되지 않는 새로운 관점의 문제를 생성하세요
- **과학 문제는 교과서의 정확한 개념만 사용하세요**

**🚫 절대 금지: 연달아 질문하는 형식**
- 하나의 문제에는 반드시 하나의 질문만 포함하세요
- "그리고", "또한", "아울러" 등으로 추가 질문을 연결하지 마세요
- 예시: ❌ "지구의 자전이란 무엇입니까? 그리고 자전 주기는 얼마나 됩니까?"
- 올바른 예시: ✅ "지구의 자전 주기는 얼마입니까?"

**어투 및 문체 지침:**
- 부드럽고 친근한 존댓말을 사용하세요: "~습니다", "~인가요?", "~일까요?"
- 학생들이 편안하게 느낄 수 있는 교실 대화체를 사용하세요
- 딱딱하고 권위적인 표현보다는 따뜻하고 격려하는 어투를 사용하세요

**어투 예시:**
- "다음 중 바르게 설명한 것은 무엇인가요?"
- "그림을 보고 어떤 생각이 드시나요?"
- "이 현상이 일어나는 이유는 무엇일까요?"
- "두 가지의 공통점은 무엇입니까?"

현재 설정된 난이도 '${state.difficulty || '중'}'에 맞는 문제를 생성하세요.

반드시 다음 형식으로 응답해주세요:

[문제] 
(구체적인 문제 내용 - 부드러운 존댓말 사용)

[선택지]
1) 첫 번째 선택지
2) 두 번째 선택지
3) 세 번째 선택지
4) 네 번째 선택지

[정답] 
정답 번호와 내용

[힌트]
문제 해결에 도움이 되는 힌트 (부드러운 어투로)

[해설]
정답에 대한 자세한 설명 (친근한 어투로)
`;

              const chatPrompt = ChatPromptTemplate.fromMessages([
                ["system", template]
              ]);
              
              const chain = chatPrompt.pipe(this.model).pipe(new StringOutputParser());
              
              const result = await chain.invoke({
                subject: state.subject,
                grade: state.grade,
                chapter_title: state.chapter_title,
                lesson_title: state.lesson_title,
                question_type: state.question_type,
                difficulty_level: state.difficulty || '중',
                additional_number: i + 1,
                reference_text: referenceText || `${state.subject} ${state.grade}학년 기본 내용`
              });

              // 결과 파싱
              const questionId = `additional_q_${Date.now()}_${i}`;
              
              const questionMatch = result.match(/\[문제\]\s*([\s\S]*?)(?=\[선택지\]|\[정답\])/);
              const optionsMatch = result.match(/\[선택지\]\s*([\s\S]*?)(?=\[정답\])/);
              const answerMatch = result.match(/\[정답\]\s*([\s\S]*?)(?=\[힌트\])/);
              const hintMatch = result.match(/\[힌트\]\s*([\s\S]*?)(?=\[해설\])/);
              const explanationMatch = result.match(/\[해설\]\s*([\s\S]*?)$/);
              
              let questionText = questionMatch ? questionMatch[1].trim() : `${state.subject} ${state.grade}학년 추가 문제 ${i + 1}`;
              let answer = answerMatch ? answerMatch[1].trim() : '정답';
              let hint = hintMatch ? hintMatch[1].trim() : `${state.chapter_title}의 핵심 개념을 떠올려보세요.`;
              let explanation = explanationMatch ? explanationMatch[1].trim() : `이 문제는 ${state.subject}의 중요한 개념을 다루고 있습니다. 차근차근 생각해보시면 답을 찾을 수 있을 거예요.`;
              
              // 선택지 파싱
              let options: string[] = [];
              if (optionsMatch && state.question_type === '객관식') {
                const optionsText = optionsMatch[1].trim();
                const optionLines = optionsText.split('\n').filter(line => line.trim());
                
                options = optionLines.map(line => {
                  return line.replace(/^\d+\)\s*/, '').trim();
                }).filter(opt => opt.length > 0);
                
                // 정답 번호 파싱 (예: "1) 첫 번째 정답" 형식)
                const answerNumberMatch = answer.match(/^(\d+)\)/);
                if (answerNumberMatch && options.length > 0) {
                  const answerIndex = parseInt(answerNumberMatch[1]) - 1;
                  if (answerIndex >= 0 && answerIndex < options.length) {
                    answer = options[answerIndex];
                  }
                }
              }
              
              // 기본값 설정 (파싱 실패 시)
              if (options.length === 0 && state.question_type === '객관식') {
                options = [
                  `${state.chapter_title}의 첫 번째 특징`,
                  `${state.chapter_title}의 두 번째 특징`, 
                  `${state.chapter_title}의 세 번째 특징`,
                  answer || '올바른 답'
                ];
              }

              const additionalQuestion: Question = {
                id: questionId,
                question: questionText,
                answer: answer,
                options: options,
                hint: hint,
                explanation: explanation,
                metadata: {
                  subject: state.subject || '',
                  grade: state.grade || '',
                  chapter_title: state.chapter_title || '',
                  lesson_title: state.lesson_title || '',
                  question_type: state.question_type || '객관식',
                  difficulty: state.difficulty || '중',
                  questionType: state.question_type || '객관식',
                  fileName: state.pdf_id || 'unknown',
                  generated_at: new Date().toISOString()
                }
              };
              
              additionalQuestions.push(additionalQuestion);
              console.log(`✅ [최종 검증] 추가 문제 '${questionId}' 생성 완료`);
              
            } catch (error: any) {
              console.error(`❌ [최종 검증] 추가 문제 ${i + 1} 생성 실패:`, error);
              
              // 실패해도 기본 문제 생성
              const fallbackQuestion: Question = {
                id: questionId,
                question: `${state.subject} ${state.grade}학년 ${state.question_type || '객관식'} 기본 문제`,
                answer: '정답',
                options: ['선택지 1', '선택지 2', '선택지 3', '정답'],
                hint: `${state.question_type || '객관식'} 문제 해결을 위한 힌트입니다.`,
                explanation: `이 문제는 ${state.subject}의 기본 개념을 다룹니다.`,
                metadata: {
                  subject: state.subject || '',
                  grade: state.grade || '',
                  chapter_title: state.chapter_title || '',
                  lesson_title: state.lesson_title || '',
                  question_type: state.question_type || '객관식',
                  difficulty: state.difficulty || '중',
                  questionType: state.question_type || '객관식',
                  fileName: state.pdf_id || 'unknown',
                  generated_at: new Date().toISOString(),
                  is_fallback: true
                }
              };
              
              additionalQuestions.push(fallbackQuestion);
            }
          }
          
          // 추가 생성된 문제들을 기존 문제와 합침
          const finalQuestions = [...questions, ...additionalQuestions];
          console.log(`🎉 [최종 검증] ${additionalQuestions.length}개 추가 생성 완료. 총 ${finalQuestions.length}개 문제`);
          
          return {
            ...state,
            final_questions: finalQuestions
          };
        }
        
        // 요청 수량과 일치하거나 더 많은 경우
        if (questions.length === 0) {
          console.log("⚠️ [최종 검증] 문제가 없어 샘플 문제 생성...");
          
          const fallbackQuestion: Question = {
            id: 'fallback_question',
            question: `${state.subject} ${state.grade}학년 샘플 문제입니다.`,
            answer: '샘플 정답',
            options: ['선택지 1', '선택지 2', '선택지 3', '샘플 정답'],
            hint: '샘플 힌트입니다.',
            explanation: '문제 생성에 실패하여 샘플 문제를 제공합니다.',
            metadata: {
              subject: state.subject || '임시과목',
              grade: state.grade || '임시학년',
              question_type: state.question_type || '객관식',
              fileName: 'fallback_workflow'
            }
          };
          
          return {
            ...state,
            final_questions: [fallbackQuestion]
          };
        }
        
        // 정확한 수량 반환 (요청 수량만큼만)
        const finalQuestions = questions.slice(0, requestedCount);
        
        console.log(`🎉 [최종 검증] ${finalQuestions.length}개 문제 최종 완료 (요청: ${requestedCount}개)`);
        
        return {
          ...state,
          final_questions: finalQuestions
        };
        
      } catch (error: any) {
        console.error("❌ [최종 검증] 오류:", error);
        return {
          ...state,
          error: error.message || "최종 검증 중 오류 발생",
          final_questions: state.validated_questions || []
        };
      }
    };
  }

  /**
   * 문제 유형별 설명 제공
   */
  private getQuestionTypeDescription(questionType: string): string {
    const descriptions: Record<string, string> = {
      '사실 확인': '구체적인 사실, 데이터, 정보를 묻는 문제',
      '개념 이해': '기본 개념과 원리의 이해를 확인하는 문제',
      '관계 분석': '요소들 간의 관계와 상호작용을 분석하는 문제',
      '적용 실습': '학습한 내용을 실제 상황에 적용하는 문제',
      '비교 분석': '서로 다른 개념이나 현상을 비교하는 문제',
      '종합 판단': '여러 정보를 종합하여 판단하는 문제',
      '문제 해결': '주어진 상황에서 해결책을 찾는 문제',
      '추론': '주어진 정보로부터 결론을 도출하는 문제'
    };
    
    return descriptions[questionType] || '주어진 내용을 바탕으로 한 문제';
  }

  /**
   * 오류 처리 노드
   */
  private handleErrorNode() {
    return async (state: StateType): Promise<StateType> => {
      console.error("❌ [오류 처리] 워크플로우 오류:", state.error);
      
      // 최소한의 결과라도 반환
      const fallbackQuestion: Question = {
        id: 'error_fallback',
        question: '오류로 인한 임시 문제입니다.',
        answer: '임시 정답',
        options: ['선택지 1', '선택지 2', '선택지 3', '임시 정답'],
        hint: '임시 힌트입니다.',
        explanation: `워크플로우 오류: ${state.error}`,
        metadata: {
          subject: state.subject || '임시과목',
          grade: state.grade || '임시학년',
          question_type: '객관식',
          fileName: 'error_workflow'
        }
      };
      
      return {
        ...state,
        final_questions: [fallbackQuestion]
      };
    };
  }

  /**
   * 문서 내용 분석 및 핵심 정보 추출
   */
  private async analyzeDocumentContent(referenceText: string, state: StateType): Promise<{
    keyConcepts: string;
    keyFacts: string; 
    specificDetails: string;
  }> {
    try {
      // 사용자 입력 키워드가 있으면 우선 활용
      const userKeywords = state.keywords && state.keywords.length > 0 ? 
        `사용자 지정 키워드: ${state.keywords.join(', ')}` : '';
      
      const analysisTemplate = `
주어진 교육 문서를 분석하여 문제 출제에 활용할 수 있는 핵심 정보를 추출해주세요.

[문서 내용]
{reference_text}

[교육 정보]
- 과목: {subject}
- 학년: {grade}학년
- 단원: {chapter_title}
- 차시: {lesson_title}
${userKeywords ? `- ${userKeywords}` : ''}

**중요**: 문서에 실제로 포함된 내용만을 추출하세요. 일반적인 지식이 아닌 이 문서의 구체적인 내용을 분석하세요.

다음 3개 영역으로 나누어 정보를 추출해주세요:

**1. 핵심 개념** (문서에서 실제 설명하는 개념들)
- 문서에서 정의하거나 설명하는 주요 개념들
- 교육과정과 연관된 중요한 용어와 그 의미

**2. 주요 사실** (문서에 명시된 구체적인 정보) 
- 문서에 기록된 구체적인 사실과 데이터
- 수치, 측정값, 역사적 사건, 지리적 정보 등

**3. 구체적 세부사항** (문제 출제 가능한 내용)
- 문서에서 언급하는 구체적인 예시와 사례
- 실험 방법, 절차, 결과 등
- 지명, 인명, 전문 용어 등

각 영역별로 문서 내용을 기반으로 간결하고 명확하게 나열해주세요.
만약 해당 영역의 내용이 문서에 없다면 "해당 내용 없음"이라고 명시하세요.
`;

      const chatPrompt = ChatPromptTemplate.fromMessages([
        ["system", analysisTemplate]
      ]);

      const chain = chatPrompt.pipe(this.model).pipe(new StringOutputParser());
      
      const analysisResult = await chain.invoke({
        reference_text: referenceText.substring(0, 4000), // 토큰 제한 고려하여 증가
        subject: state.subject,
        grade: state.grade,
        chapter_title: state.chapter_title,
        lesson_title: state.lesson_title
      });

      console.log("📊 [문서 분석] 결과 미리보기:", analysisResult.substring(0, 200) + "...");

      // 간단한 파싱으로 각 영역 추출
      const conceptMatch = analysisResult.match(/\*\*1\.\s*핵심 개념\*\*([\s\S]*?)(?=\*\*2\.|$)/);
      const factMatch = analysisResult.match(/\*\*2\.\s*주요 사실\*\*([\s\S]*?)(?=\*\*3\.|$)/);
      const detailMatch = analysisResult.match(/\*\*3\.\s*구체적 세부사항\*\*([\s\S]*?)$/);
      
      return {
        keyConcepts: conceptMatch ? conceptMatch[1].trim() : '해당 내용 없음',
        keyFacts: factMatch ? factMatch[1].trim() : '해당 내용 없음', 
        specificDetails: detailMatch ? detailMatch[1].trim() : '해당 내용 없음'
      };

    } catch (error) {
      console.error("❌ [문서 분석] 오류:", error);
      return {
        keyConcepts: '분석 실패',
        keyFacts: '분석 실패',
        specificDetails: '분석 실패'
      };
    }
  }

  /**
   * 문제 유사도 계산 (간단한 키워드 기반)
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = text1.toLowerCase().split(/\s+/).filter(word => word.length > 1);
    const words2 = text2.toLowerCase().split(/\s+/).filter(word => word.length > 1);
    
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return union.size === 0 ? 0 : intersection.size / union.size;
  }
  
  /**
   * 선택지 유사도 계산
   */
  private calculateOptionsSimilarity(options1: string[], options2: string[]): number {
    if (options1.length !== options2.length) return 0;
    
    let matches = 0;
    for (let i = 0; i < options1.length; i++) {
      const similarity = this.calculateSimilarity(options1[i], options2[i]);
      if (similarity > 0.6) matches++;
    }
    
    return matches / options1.length;
  }

  /**
   * 선택지 길이 균형 검증
   */
  private validateOptionsBalance(options: string[]): { isBalanced: boolean; report: string } {
    if (!options || options.length === 0) {
      return { isBalanced: true, report: "선택지 없음" };
    }

    // 각 선택지의 글자 수 계산
    const lengths = options.map(option => option.length);
    const minLength = Math.min(...lengths);
    const maxLength = Math.max(...lengths);
    const avgLength = lengths.reduce((sum, len) => sum + len, 0) / lengths.length;
    const lengthDiff = maxLength - minLength;

    // 균형 기준: 최대 차이 10자 이내
    const isBalanced = lengthDiff <= 10;
    
    const report = `길이 범위: ${minLength}~${maxLength}자 (평균: ${avgLength.toFixed(1)}자, 차이: ${lengthDiff}자)`;
    
    if (!isBalanced) {
      const lengthDetails = options.map((opt, idx) => `${idx + 1}번: ${opt.length}자`).join(', ');
      return { 
        isBalanced: false, 
        report: `⚠️ 선택지 길이 불균형 - ${report} [${lengthDetails}]` 
      };
    }

    return { isBalanced: true, report: `✅ 선택지 길이 균형 - ${report}` };
  }

  /**
   * 연달아 질문하는 형식 검증
   */
  private validateSingleQuestion(questionText: string): { isValid: boolean; report: string } {
    if (!questionText) {
      return { isValid: false, report: "질문 텍스트 없음" };
    }

    // 연달아 질문하는 패턴 감지
    const multiQuestionPatterns = [
      /\?.*그리고.*\?/,           // "...? 그리고 ...?"
      /\?.*또한.*\?/,             // "...? 또한 ...?"
      /\?.*아울러.*\?/,           // "...? 아울러 ...?"
      /\?.*더불어.*\?/,           // "...? 더불어 ...?"
      /\?.*그런데.*\?/,           // "...? 그런데 ...?"
      /\?.*그리고.*무엇/,         // "...? 그리고 무엇..."
      /\?.*또한.*무엇/,           // "...? 또한 무엇..."
      /\?.*이유.*설명/,           // "...? 이유를 설명..."
      /\?.*왜.*그런/,             // "...? 왜 그런..."
      /무엇.*\?.*무엇/,           // "무엇...? 무엇..."
      /어떤.*\?.*어떤/,           // "어떤...? 어떤..."
      /\?.*\d+.*\?/,              // "...? 1) ... ?"
    ];

    for (const pattern of multiQuestionPatterns) {
      if (pattern.test(questionText)) {
        return { 
          isValid: false, 
          report: `⚠️ 연달아 질문 형식 감지: "${questionText.substring(0, 50)}..."` 
        };
      }
    }

    // 물음표 개수 확인 (2개 이상이면 의심)
    const questionMarkCount = (questionText.match(/\?/g) || []).length;
    if (questionMarkCount >= 2) {
      return { 
        isValid: false, 
        report: `⚠️ 다중 질문 의심 (물음표 ${questionMarkCount}개): "${questionText.substring(0, 50)}..."` 
      };
    }

    return { isValid: true, report: "✅ 단일 질문 형식" };
  }

  /**
   * 선택지 길이 균형 자동 조정
   */
  private adjustOptionsBalance(options: string[], questionText: string): string[] {
    if (!options || options.length === 0) return options;

    const lengths = options.map(option => option.length);
    const avgLength = lengths.reduce((sum, len) => sum + len, 0) / lengths.length;
    const targetLength = Math.round(avgLength);

    return options.map((option, index) => {
      const currentLength = option.length;
      
      // 너무 짧은 경우 적절히 확장
      if (currentLength < targetLength - 5) {
        // 의미를 유지하면서 길이 조정
        if (option.includes('시간') && !option.includes('약')) {
          return `약 ${option}`;
        } else if (option.includes('일') && !option.includes('정도')) {
          return `${option} 정도`;
        } else if (option.includes('년') && !option.includes('약')) {
          return `약 ${option}`;
        } else if (option.includes('개') && !option.includes('약')) {
          return `약 ${option}`;
        } else if (option.includes('번') && !option.includes('약')) {
          return `약 ${option}`;
        } else if (!option.includes('것') && option.length < 8) {
          return `${option}인 것`;
        } else if (option.length < 6) {
          return `${option}입니다`;
        } else {
          return `${option}라고 함`;
        }
      }
      
      // 너무 긴 경우 적절히 축약
      if (currentLength > targetLength + 5) {
        // 불필요한 표현 제거
        let shortened = option
          .replace(/라고 합니다$/, '')
          .replace(/라고 함$/, '')
          .replace(/입니다$/, '')
          .replace(/인 것$/, '')
          .replace(/정도$/, '')
          .replace(/^약 /, '')
          .replace(/이라고 불리는$/, '')
          .replace(/라고 불리는$/, '')
          .trim();
        
        // 여전히 너무 길면 핵심 단어만 추출
        if (shortened.length > targetLength + 3) {
          // 괄호 안 내용 제거
          shortened = shortened.replace(/\([^)]*\)/g, '').trim();
          
          // 쉼표 이후 내용 제거 (보조 설명 제거)
          if (shortened.includes(',')) {
            shortened = shortened.split(',')[0].trim();
          }
        }
        
        return shortened;
      }
      
      return option;
    });
  }

  /**
   * 워크플로우 실행 메서드
   */
  public async runWorkflow(input: any, progressCallback?: (progress: number, status: string) => void): Promise<StateType> {
    try {
      console.log("🚀 [워크플로우] 시작:", input);
      
      if (progressCallback) {
        // 진행률 콜백이 있는 경우 직접 노드들을 순차적으로 실행
        let state: StateType = {
          subject: input.subject,
          grade: input.grade,
          chapter_title: input.chapter_title,
          lesson_title: input.lesson_title,
          keywords: input.metadata?.keywords || [],
          question_type: input.question_type,
          difficulty: this.mapDifficultyLevel(input.difficulty) || '중',
          num_questions: input.num_questions,
          pdf_id: input.pdf_id
        };

        progressCallback(5, "문서 검색 중...");
        state = await this.searchDocumentsNode()(state);

        progressCallback(20, "문제 생성 중...");
        state = await this.generateQuestionsNode()(state);

        progressCallback(60, "힌트 및 해설 생성 중...");
        state = await this.generateHintExplanationNode()(state);

        progressCallback(75, "중복 문제 제거 중...");
        state = await this.deduplicateQuestionsNode()(state);

        progressCallback(90, "최종 검증 중...");
        state = await this.validateQuestionsNode()(state);

        progressCallback(100, "완료");
        return state;

      } else {
        // 진행률 콜백이 없는 경우 기본 워크플로우 실행
        const result = await this.workflow.invoke(input);
        return result;
      }

    } catch (error: any) {
      console.error("❌ [워크플로우] 실행 오류:", error);
      
      if (progressCallback) {
        progressCallback(0, `오류: ${error.message}`);
      }
      
      return await this.handleErrorNode()({
        ...input,
        error: error.message || "워크플로우 실행 중 오류 발생"
      });
    }
  }

  /**
   * UI 난이도를 내부 난이도로 매핑
   */
  private mapDifficultyLevel(uiDifficulty: string): string {
    const difficultyMap: Record<string, string> = {
      '쉬움': '하',
      '보통': '중', 
      '어려움': '상',
      // 기존 값들도 지원
      '하': '하',
      '중': '중',
      '상': '상'
    };
    
    const mapped = difficultyMap[uiDifficulty] || '중';
    console.log(`🎯 [난이도 매핑] "${uiDifficulty}" → "${mapped}"`);
    return mapped;
  }
}

// 싱글톤 인스턴스 생성
const questionWorkflow = new QuestionWorkflow();

export default questionWorkflow; 