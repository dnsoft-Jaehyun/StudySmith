"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphWorker = void 0;
const openai_1 = __importDefault(require("openai"));
/**
 * 간소화된 그래프 워커 - 상태머신 패턴으로 구현
 */
class GraphWorker {
    constructor() {
        // OpenAI 클라이언트 초기화
        this.openai = new openai_1.default({
            apiKey: process.env.OPENAI_API_KEY,
        });
    }
    // 최초 상태 초기화
    initState(chunk) {
        return {
            chunk,
            phrases: [],
            stem: '',
            choices: {
                correct: '',
                distractors: []
            },
            score: 0,
            revision_count: 0,
            feedback: ''
        };
    }
    // 로더 노드 - 텍스트 청크 처리
    async loaderNode(state) {
        // 텍스트 전처리만 수행
        return {
            ...state,
            chunk: state.chunk.trim()
        };
    }
    // 핵심 구문 추출 노드
    async keyPhraseNode(state) {
        var _a;
        const systemMsg = `당신은 교육용 문제를 생성하는 AI 시스템의 핵심 구문 추출기입니다.
주어진 텍스트에서 교육적으로 중요한 핵심 개념과 구문을 최대 5개 추출해주세요.
이 핵심 구문들은 초등학교 국어, 사회, 과학 시험 문제로 만들기에 적합해야 합니다.`;
        const userMsg = `다음 텍스트에서 핵심 구문 5개를 추출해주세요:\n\n${state.chunk}`;
        const response = await this.openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
            messages: [
                { role: 'system', content: systemMsg },
                { role: 'user', content: userMsg }
            ],
            temperature: 0.3,
        });
        const content = ((_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message.content) || '';
        const phrases = content
            .split('\n')
            .filter(line => line.trim().length > 0)
            .map(line => line.replace(/^\d+\.\s*/, '').trim())
            .filter(phrase => phrase.length > 0)
            .slice(0, 5);
        return {
            ...state,
            phrases
        };
    }
    // 문제 생성 노드
    async questionGenNode(state) {
        var _a;
        const feedback = state.revision_count > 0
            ? `이전 문제의 피드백: ${state.feedback}\n\n개선사항을 반영하여 새로운 문제를 생성해주세요.`
            : '';
        const systemMsg = `당신은 초등학교 5학년 국어 문제를 생성하는 전문가입니다.
주어진 핵심 구문들을 바탕으로 교육적으로 가치 있는 객관식 문제를 생성해주세요.
문제 형식:
1. 적절한 난이도의 문제 지문(stem)을 작성합니다.
2. 답변은 명확하고 교육적으로 의미 있어야 합니다.
${feedback}`;
        const userMsg = `다음 핵심 구문들을 바탕으로 문제를 만들어주세요:
${state.phrases.map((p, i) => `${i + 1}. ${p}`).join('\n')}

원본 텍스트:
${state.chunk.substring(0, 300)}...`;
        const response = await this.openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
            messages: [
                { role: 'system', content: systemMsg },
                { role: 'user', content: userMsg }
            ],
            temperature: 0.3,
        });
        let stem = ((_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message.content) || '';
        // 지문과 정답 분리 로직 (필요시 추가 구현)
        const answerMatch = stem.match(/정답[:\s]*([A-E가-마])/i);
        const correctAnswer = answerMatch ? answerMatch[1] : '';
        stem = stem.replace(/정답[:\s]*[A-E가-마]/i, '').trim();
        return {
            ...state,
            stem,
            choices: {
                ...state.choices,
                correct: correctAnswer
            },
            revision_count: state.revision_count + 1
        };
    }
    // 오답지 생성 노드
    async distractorNode(state) {
        var _a;
        const systemMsg = `당신은 국어 문제를 위한 고품질 오답지 생성 전문가입니다.
주어진 문제와 정답을 바탕으로 학생들이 혼동할 수 있는 적절한 오답 3개를 생성해주세요.
오답은 다음 조건을 만족해야 합니다:
1. 너무 쉽게 배제할 수 있는 명백한 오답은 피합니다.
2. 정답과 너무 유사해서 혼란을 주는 모호한 보기도 피합니다.
3. 교육적으로 의미 있고, 학생의 이해도를 측정할 수 있어야 합니다.`;
        const userMsg = `다음 문제와 정답을 바탕으로 적절한 오답 3개를 생성해주세요:

문제: ${state.stem}
정답: ${state.choices.correct}

오답지 3개를 생성해주세요.`;
        const response = await this.openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
            messages: [
                { role: 'system', content: systemMsg },
                { role: 'user', content: userMsg }
            ],
            temperature: 0.3,
        });
        const content = ((_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message.content) || '';
        const distractors = content
            .split('\n')
            .filter(line => line.trim().length > 0)
            .map(line => line.replace(/^\d+\.\s*/, '').trim())
            .filter(distractor => distractor.length > 0)
            .slice(0, 3);
        return {
            ...state,
            choices: {
                ...state.choices,
                distractors
            }
        };
    }
    // 검증 노드 - 품질 평가 및 피드백 제공
    async verifierNode(state) {
        var _a;
        const allChoices = [state.choices.correct, ...state.choices.distractors];
        const systemMsg = `당신은 초등학교 5학년 국어 교과 문제의 품질을 평가하는 전문가입니다.
다음 기준에 따라 문제를 평가하고 0.0에서 1.0 사이의 점수를 부여해주세요:

1. 사실 정확성 (0.0-1.0): 문제와 정답이 교과서 내용과 일치하는가?
2. 국어 맞춤법 (0.0-1.0): 문법 오류나 맞춤법 오류가 없는가?
3. 난이도 적절성 (0.0-1.0): 초등학교 5학년 수준에 적합한가?

종합 점수를 0.0-1.0 사이로 출력해주세요. 또한 개선이 필요한 사항을 구체적으로 피드백 해주세요.`;
        const userMsg = `다음 문제를 평가해주세요:

문제: ${state.stem}
정답: ${state.choices.correct}
보기: ${allChoices.join(', ')}

원본 텍스트:
${state.chunk.substring(0, 200)}...

품질 평가와 구체적인 피드백을 제공해주세요.`;
        const response = await this.openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4-turbo',
            messages: [
                { role: 'system', content: systemMsg },
                { role: 'user', content: userMsg }
            ],
            temperature: 0.3,
        });
        const content = ((_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message.content) || '';
        // 점수 추출 (정규식)
        const scoreMatch = content.match(/종합\s*점수\s*:\s*(\d+(\.\d+)?)/i) ||
            content.match(/점수\s*:\s*(\d+(\.\d+)?)/i);
        const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0.5;
        // 피드백 추출
        const feedback = content.replace(/종합\s*점수\s*:\s*\d+(\.\d+)?/i, '').trim();
        return {
            ...state,
            score,
            feedback
        };
    }
    // 문제 유형별 문제 생성 함수
    async generateQuestionByType(metadata, type, includeHints = true, includeExplanations = true) {
        var _a;
        try {
            const { subject, grade, chapter_title, lesson_title, chapter_id, lesson_id, difficulty = '보통', keywords = [] } = metadata;
            // 교과, 학년, 단원, 차시 정보 조합
            const context = `${subject} ${grade} 교과 - ${chapter_title || '단원'} - ${lesson_title || '차시'}
주요 개념: ${keywords.join(', ')}
난이도: ${difficulty}`;
            // 문제 유형별 프롬프트 조정
            let promptType = '객관식';
            let options = true;
            switch (type.toLowerCase()) {
                case '주관식':
                    promptType = '주관식';
                    options = false;
                    break;
                case '진위형':
                    promptType = '진위형(O/X)';
                    options = false;
                    break;
                case '빈칸추론':
                    promptType = '빈칸 채우기';
                    options = true;
                    break;
                case '서술형':
                    promptType = '서술형';
                    options = false;
                    break;
                default:
                    promptType = '객관식';
                    options = true;
            }
            // 시스템 메시지
            const systemMessage = `당신은 ${grade} ${subject} 교과 ${promptType} 문제를 생성하는 전문 교육 AI입니다.
다음 요구사항에 맞는 고품질 문제를 생성해주세요:

🚨 과학적 정확성 필수 확인:
- ✅ 낮과 밤: 지구의 자전 때문 (절대 공전 아님!)
- ✅ 계절: 지구의 공전과 지축 기울어짐 때문
- ✅ 달의 위상: 달의 공전과 위치관계 때문
- ❌ 절대 금지: "공전으로 인한 낮과 밤" - 완전히 틀린 설명
- ❌ 잘못된 패턴: "공전함에 따라", "공전함으로써", "공전함과 같은" 표현 금지

1. 교육과정: ${subject} ${grade} - ${chapter_title} - ${lesson_title}
2. 문제 유형: ${promptType}
3. 난이도: ${difficulty}
${options ? '4. 4~5개의 선택지를 제공하세요. 한 개의 정답과 나머지는 오답입니다.' : ''}
5. 문제는 교육적으로 가치 있고, 학생의 이해도를 평가할 수 있어야 합니다.
6. 과학 문제는 교과서의 정확한 개념만 사용하세요.
${includeHints ? '7. 학생이 문제 해결을 위한 힌트를 제공하세요.' : ''}
${includeExplanations ? '8. 문제의 정답과 풀이 과정을 포함한 자세한 해설을 제공하세요.' : ''}

JSON 형식으로 다음과 같이 출력해주세요:
{
  "question": "문제 내용",
  ${options ? '"options": ["보기1", "보기2", "보기3", "보기4", "보기5"],' : ''}
  "answer": "${options ? '정답 보기 전체 텍스트' : '정답'}",
  ${includeHints ? '"hint": "문제 해결을 위한 힌트",' : ''}
  ${includeExplanations ? '"explanation": "문제 해설"' : ''}
}`;
            // 사용자 메시지
            const userMessage = `${context}

위 교과 내용에 맞는 고품질 ${promptType} 문제를 생성해주세요.`;
            // API 호출
            const response = await this.openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || 'gpt-4-turbo',
                messages: [
                    { role: 'system', content: systemMessage },
                    { role: 'user', content: userMessage }
                ],
                temperature: 0.7,
                response_format: { type: "json_object" }
            });
            const content = ((_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message.content) || '';
            let parsedQuestion;
            try {
                parsedQuestion = JSON.parse(content);
            }
            catch (error) {
                console.error('문제 JSON 파싱 오류:', error);
                console.error('원본 응답:', content);
                // 응급 처리: 기본 문제 객체 반환
                parsedQuestion = {
                    question: '오류: 문제 생성에 실패했습니다.',
                    options: options ? ['오류 발생', '문제 생성 실패', '다시 시도해주세요', '시스템 문제'] : undefined,
                    answer: '오류 발생',
                    explanation: '문제 생성 중 오류가 발생했습니다.',
                };
            }
            // 문제 ID 생성
            const timestamp = Date.now();
            const randomId = Math.floor(Math.random() * 1000);
            // 문제 객체 구성
            const question = {
                id: `${type.toLowerCase()}_${timestamp}_${randomId}`,
                question: parsedQuestion.question,
                options: parsedQuestion.options,
                answer: parsedQuestion.answer,
                hint: parsedQuestion.hint,
                explanation: parsedQuestion.explanation,
                quality_score: 0.9,
                run_engine: 'graph',
                metadata: {
                    subject,
                    grade,
                    chapter_id: chapter_id || undefined,
                    lesson_id: lesson_id || undefined,
                    chapter_title: chapter_title || undefined,
                    lesson_title: lesson_title || undefined,
                    question_type: type,
                    difficulty
                }
            };
            return question;
        }
        catch (error) {
            console.error('문제 생성 오류:', error);
            throw error;
        }
    }
    // 대화셋 생성 함수 - 문제 유형 정보 추가
    async generateDialogue(metadata, params) {
        var _a;
        try {
            console.log('대화셋 생성 시작:', metadata);
            const { subject, grade, chapter_title, lesson_title, objective, keywords } = metadata;
            const { dialogue_type, num_messages, question_type } = params;
            // 문제 유형 정보 추가
            const questionTypeInfo = question_type
                ? `이 대화는 ${question_type} 유형의 문제에 대한 ${dialogue_type}입니다.`
                : '';
            // 대화 컨텍스트 생성
            const context = `${subject} ${grade}학년 ${chapter_title} ${lesson_title}
학습 목표: ${objective || ''}
주요 개념: ${keywords ? keywords.join(', ') : ''}
${questionTypeInfo}`;
            // 시스템 메시지 설정
            let dialoguePrompt = '';
            switch (dialogue_type) {
                case '질의응답':
                    dialoguePrompt = '학생의 질문에 교사가 답변하는 형식으로 대화를 생성해주세요.';
                    break;
                case '개념설명':
                    dialoguePrompt = '교사가 개념을 설명하고 학생이 이해하는 과정을 대화 형식으로 생성해주세요.';
                    break;
                case '수업대화':
                    dialoguePrompt = '교실에서 진행되는 수업 상황의 대화를 생성해주세요.';
                    break;
                case '문제해설':
                    dialoguePrompt = `${question_type || '객관식'} 문제를 학생이 질문하고 교사가 힌트와 해설을 제공하는 대화를 생성해주세요.`;
                    break;
                default:
                    dialoguePrompt = '교육적으로 의미 있는 대화를 생성해주세요.';
            }
            const systemMessage = `당신은 ${grade}학년 ${subject} 과목을 가르치는 교육 AI 어시스턴트입니다.
${dialoguePrompt}

다음 학습 주제에 맞는 교육적 대화를 생성해주세요:
- 과목: ${subject}
- 학년: ${grade}
- 단원: ${chapter_title}
- 차시: ${lesson_title}
- 학습 목표: ${objective || ''}
- 주요 개념: ${keywords ? keywords.join(', ') : ''}
${question_type ? `- 문제 유형: ${question_type}` : ''}

대화는 다음 형식을 따라야 합니다:
1. 대화는 학생의 질문으로 시작합니다.
2. 학생의 질문은 단원과 학습 목표에 관련된 내용이어야 합니다.
3. 교사/AI의 응답은 명확하고 정확하며 학습 목표를 달성하는 데 도움이 되어야 합니다.
4. 대화는 최소 ${num_messages || 3}번의 교환(턴)을 포함해야 합니다.
5. 필요한 경우 예시나 비유를 사용해 설명하세요.
${dialogue_type === '문제해설' ? '6. 학생이 질문하는 문제에 대해 힌트와 자세한 해설을 포함해주세요.' : ''}`;
            // 대화 생성
            const response = await this.openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
                messages: [
                    { role: 'system', content: systemMessage },
                    { role: 'user', content: `${context}\n\n위 내용에 맞는 학습 대화를 생성해주세요.` }
                ],
                temperature: 0.7,
            });
            const content = ((_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message.content) || '';
            // 대화 메시지 파싱
            const dialogueMessages = [];
            const lines = content.split('\n');
            let currentRole = '';
            let currentContent = '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('학생:') || trimmed.startsWith('Student:')) {
                    // 이전 메시지 저장
                    if (currentRole && currentContent) {
                        dialogueMessages.push({
                            role: currentRole,
                            content: currentContent.trim()
                        });
                    }
                    // 새 메시지 시작
                    currentRole = 'user';
                    currentContent = trimmed.replace(/^학생:|^Student:/, '').trim();
                }
                else if (trimmed.startsWith('교사:') || trimmed.startsWith('AI:') ||
                    trimmed.startsWith('Teacher:') || trimmed.startsWith('Assistant:')) {
                    // 이전 메시지 저장
                    if (currentRole && currentContent) {
                        dialogueMessages.push({
                            role: currentRole,
                            content: currentContent.trim()
                        });
                    }
                    // 새 메시지 시작
                    currentRole = 'assistant';
                    currentContent = trimmed.replace(/^교사:|^AI:|^Teacher:|^Assistant:/, '').trim();
                }
                else if (currentRole) {
                    // 현재 메시지에 내용 추가
                    currentContent += '\n' + trimmed;
                }
            }
            // 마지막 메시지 저장
            if (currentRole && currentContent) {
                dialogueMessages.push({
                    role: currentRole,
                    content: currentContent.trim()
                });
            }
            // 시스템 메시지 추가
            dialogueMessages.unshift({
                role: 'system',
                content: `이 대화는 ${grade}학년 ${subject} 과목 '${chapter_title} > ${lesson_title}' 학습을 위한 대화입니다.`
            });
            // 대화셋 객체 생성
            const dialogue = {
                id: `dialogue_${Date.now()}`,
                title: `${subject} ${grade}학년 - ${chapter_title} - ${lesson_title}`,
                description: objective || '',
                messages: dialogueMessages,
                metadata: {
                    subject,
                    grade,
                    chapter_id: metadata.chapter_id,
                    chapter_title,
                    lesson_id: metadata.lesson_id,
                    lesson_title,
                    dialogue_type: dialogue_type || '일반대화',
                    question_type: question_type,
                    tags: keywords || []
                },
                quality_score: 0.9,
                created_at: new Date()
            };
            return dialogue;
        }
        catch (error) {
            console.error('대화셋 생성 오류:', error);
            throw error;
        }
    }
    // 여러 개의 문제와 대화셋을 생성하는 함수
    async runGraph(pdfStream, options) {
        try {
            console.log('GraphWorker.runGraph 호출됨:', options);
            if (!options.useMetadata && !pdfStream) {
                throw new Error('메타데이터나 PDF 스트림 중 하나는 제공되어야 합니다.');
            }
            const metadata = options.metadata || {};
            const generateQuestions = options.generateQuestions === true;
            const generateDialogues = options.generateDialogues === true;
            const results = {
                questions: []
            };
            // 문제 생성
            if (generateQuestions && options.questionParams) {
                const { num_questions, question_type, difficulty, include_hints = true, include_explanations = true } = options.questionParams;
                console.log(`${num_questions}개 ${question_type} 유형 문제 생성 중...`);
                for (let i = 0; i < num_questions; i++) {
                    try {
                        // 문제 타입별 생성
                        // chapter_title과 lesson_title 필드가 있는지 확인하고 없으면 기본값 설정
                        const enhancedMetadata = {
                            ...metadata,
                            difficulty,
                            chapter_title: metadata.chapter_title || `${metadata.subject} ${metadata.grade}학년 기본 단원`,
                            lesson_title: metadata.lesson_title || '기본 차시'
                        };
                        const question = await this.generateQuestionByType(enhancedMetadata, question_type, include_hints, include_explanations);
                        results.questions.push(question);
                        console.log(`문제 ${i + 1}/${num_questions} 생성 완료`);
                    }
                    catch (error) {
                        console.error(`문제 ${i + 1}/${num_questions} 생성 오류:`, error);
                    }
                }
            }
            // 대화셋 생성
            if (generateDialogues && options.dialogueParams) {
                const { num_dialogues, dialogue_type, messages_per_dialogue = 3, question_type } = options.dialogueParams;
                console.log(`${num_dialogues}개 ${dialogue_type} 유형 대화셋 생성 중...`);
                const dialogues = [];
                for (let i = 0; i < num_dialogues; i++) {
                    try {
                        // 메타데이터에 chapter_title과 lesson_title 기본값 추가
                        const enhancedMetadata = {
                            ...metadata,
                            chapter_title: metadata.chapter_title || `${metadata.subject} ${metadata.grade}학년 기본 단원`,
                            lesson_title: metadata.lesson_title || '기본 차시'
                        };
                        const dialogue = await this.generateDialogue(enhancedMetadata, {
                            dialogue_type,
                            num_messages: messages_per_dialogue,
                            question_type: question_type || '객관식' // question_type에 기본값 제공
                        });
                        dialogues.push(dialogue);
                        console.log(`대화셋 ${i + 1}/${num_dialogues} 생성 완료`);
                    }
                    catch (error) {
                        console.error(`대화셋 ${i + 1}/${num_dialogues} 생성 오류:`, error);
                    }
                }
                results.dialogues = dialogues;
            }
            return results;
        }
        catch (error) {
            console.error('GraphWorker.runGraph 오류:', error);
            throw error;
        }
    }
}
exports.GraphWorker = GraphWorker;
exports.default = new GraphWorker();
