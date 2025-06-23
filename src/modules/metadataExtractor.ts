/**
 * PDF 문서에서 교육 메타데이터를 자동으로 추출하는 모듈
 * 파일명, 텍스트 내용, 구조 분석을 통해 교과, 학년, 단원, 차시 정보를 추론
 */

interface ExtractedMetadata {
  subject?: string;
  grade?: string;
  chapter?: string;
  lesson?: string;
  keywords?: string[]; // 배열로 유지, 검색시에만 스칼라 처리
  difficulty?: string;
  documentType?: string;
}

export class MetadataExtractor {
  // 교과목 키워드 매핑
  private readonly subjectKeywords: Record<string, string[]> = {
    '국어': ['국어', '한글', '문학', '문법', '읽기', '쓰기', '말하기', '듣기', '언어'],
    '과학': ['과학', '실험', '생물', '화학', '물리', '지구과학', '자연', '에너지', '물질'],
    '사회': ['사회', '역사', '지리', '정치', '경제', '문화', '민주주의', '지도', '국가'],
  };

  // 학년 패턴
  private readonly gradePatterns = [
    /(\d+)\s*학년/,
    /(\d+)학년/,
    /초등\s*(\d+)/,
    /중등\s*(\d+)/,
    /고등\s*(\d+)/,
    /grade\s*(\d+)/i,
    /G(\d+)/,
    /(\d+)-\d+/  // 예: 3-1 (3학년 1학기)
  ];

  // 단원 패턴
  private readonly chapterPatterns = [
    /제?\s*(\d+)\s*단원/,
    /(\d+)단원/,
    /단원\s*(\d+)/,
    /Chapter\s*(\d+)/i,
    /Unit\s*(\d+)/i,
    /제?\s*([일이삼사오육칠팔구십]+)\s*단원/,
    /\d+\.\s*([^\.]+)/  // 예: 1. 우리나라의 정치 발전
  ];

  // 차시 패턴
  private readonly lessonPatterns = [
    /(\d+)\s*차시/,
    /(\d+)차시/,
    /차시\s*(\d+)/,
    /Lesson\s*(\d+)/i,
    /(\d+)\s*교시/,
    /(\d+)-(\d+)/  // 예: 3-2 (3단원 2차시)
  ];

  // 난이도 키워드
  private readonly difficultyKeywords: Record<string, string[]> = {
    '상': ['심화', '고급', '어려움', '도전', '발전', '응용'],
    '중': ['기본', '표준', '일반', '보통'],
    '하': ['기초', '입문', '쉬움', '기본']
  };

  // 문서 유형 키워드
  private readonly documentTypeKeywords: Record<string, string[]> = {
    '교과서': ['교과서', '교육부', '검정', '인정'],
    '문제집': ['문제집', '문제', '평가', '시험', '연습'],
    '지도서': ['지도서', '교사용', '지도안', '수업'],
    '참고서': ['참고서', '해설', '정리', '요약']
  };

  /**
   * 파일명에서 메타데이터 추출
   */
  public extractFromFilename(filename: string): ExtractedMetadata {
    const metadata: ExtractedMetadata = {};
    
    // 파일명에서 확장자 제거
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
    
    console.log(`[메타데이터 추출] 원본 파일명: ${filename}`);
    console.log(`[메타데이터 추출] 확장자 제거: ${nameWithoutExt}`);

    // 교과목 추출 (대소문자 구분 없이)
    for (const [subject, keywords] of Object.entries(this.subjectKeywords)) {
      if (keywords.some(keyword => nameWithoutExt.toLowerCase().includes(keyword.toLowerCase()))) {
        metadata.subject = subject;
        console.log(`[메타데이터 추출] 교과목 발견: ${subject} (키워드: ${keywords.find(k => nameWithoutExt.toLowerCase().includes(k.toLowerCase()))})`);
        break;
      }
    }

    // 학년 추출 (원본 파일명에서 직접 패턴 매칭)
    for (const pattern of this.gradePatterns) {
      const match = nameWithoutExt.match(pattern);
      if (match && match[1]) {
        const grade = parseInt(match[1]);
        if (grade >= 1 && grade <= 6) {
          metadata.grade = grade.toString();
          console.log(`[메타데이터 추출] 학년 발견: ${grade} (패턴: ${pattern}, 매칭: ${match[0]})`);
          break;
        }
      }
    }

    // 정규화된 이름으로 단원/차시 추출 (하이픈과 언더스코어를 공백으로)
    const normalizedName = nameWithoutExt.toLowerCase().replace(/[_-]/g, ' ');
    console.log(`[메타데이터 추출] 정규화된 이름: ${normalizedName}`);

    // 단원 추출
    for (const pattern of this.chapterPatterns) {
      const match = normalizedName.match(pattern);
      if (match && match[1]) {
        metadata.chapter = match[0];
        console.log(`[메타데이터 추출] 단원 발견: ${match[0]}`);
        break;
      }
    }

    // 차시 추출
    for (const pattern of this.lessonPatterns) {
      const match = normalizedName.match(pattern);
      if (match && match[1]) {
        metadata.lesson = match[0];
        console.log(`[메타데이터 추출] 차시 발견: ${match[0]}`);
        break;
      }
    }

    console.log(`[메타데이터 추출] 최종 결과:`, metadata);
    return metadata;
  }

  /**
   * 텍스트 내용에서 메타데이터 추출
   */
  public extractFromText(text: string, maxLength: number = 5000): ExtractedMetadata {
    const metadata: ExtractedMetadata = {};
    
    // 분석할 텍스트 제한 (처음 5000자)
    const analyzedText = text.substring(0, maxLength).toLowerCase();

    // 교과목 추출 (빈도 기반)
    const subjectScores: Record<string, number> = {};
    for (const [subject, keywords] of Object.entries(this.subjectKeywords)) {
      subjectScores[subject] = 0;
      for (const keyword of keywords) {
        const regex = new RegExp(keyword.toLowerCase(), 'g');
        const matches = analyzedText.match(regex);
        if (matches) {
          subjectScores[subject] += matches.length;
        }
      }
    }

    // 가장 높은 점수의 교과목 선택
    const topSubject = Object.entries(subjectScores)
      .sort(([, a], [, b]) => b - a)
      .filter(([, score]) => score > 0)[0];
    
    if (topSubject) {
      metadata.subject = topSubject[0];
    }

    // 학년 추출 (첫 번째 매칭)
    for (const pattern of this.gradePatterns) {
      const match = text.match(pattern);  // 원본 텍스트에서 검색
      if (match && match[1]) {
        const grade = parseInt(match[1]);
        if (grade >= 1 && grade <= 6) {
          metadata.grade = grade.toString();
          break;
        }
      }
    }

    // 단원명 추출 (목차나 제목에서)
    const chapterMatch = text.match(/제?\s*\d+\s*단원[:\s]*([^\n]+)/);
    if (chapterMatch && chapterMatch[1]) {
      metadata.chapter = chapterMatch[1].trim();
    }

    // 차시명 추출
    const lessonMatch = text.match(/\d+\s*차시[:\s]*([^\n]+)/);
    if (lessonMatch && lessonMatch[1]) {
      metadata.lesson = lessonMatch[1].trim();
    }

    // 키워드 추출 (배열로 저장하되 검색시에는 스칼라 처리)
    const keywordList = this.extractKeywords(text);
    if (keywordList.length > 0) {
      metadata.keywords = keywordList; // 배열로 저장
    }

    // 난이도 추출
    for (const [level, keywords] of Object.entries(this.difficultyKeywords)) {
      if (keywords.some(keyword => analyzedText.includes(keyword))) {
        metadata.difficulty = level;
        break;
      }
    }

    // 문서 유형 추출
    for (const [type, keywords] of Object.entries(this.documentTypeKeywords)) {
      if (keywords.some(keyword => analyzedText.includes(keyword))) {
        metadata.documentType = type;
        break;
      }
    }

    return metadata;
  }

  /**
   * 텍스트에서 교육 관련 키워드 추출 (v1 호환 정규화 적용)
   */
  private extractKeywords(text: string): string[] {
    const keywords: string[] = [];
    
    // 교육 관련 패턴들
    const patterns = [
      /학습\s*목표[:\s]*([^\n]+)/g,
      /핵심\s*개념[:\s]*([^\n]+)/g,
      /주요\s*내용[:\s]*([^\n]+)/g,
      /키워드[:\s]*([^\n]+)/g,
      /중요\s*용어[:\s]*([^\n]+)/g
    ];

    for (const pattern of patterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          // 쉼표나 점으로 구분된 키워드 분리
          const items = match[1].split(/[,、·•․]/);
          keywords.push(...items
            .map(item => {
              // v1 호환 정규화: 벡터스토어 저장 시와 동일한 로직
              const trimmed = item.trim().toLowerCase();
              return trimmed.replace(/[^\w가-힣]/g, ''); // 특수문자 제거
            })
            .filter(item => item.length > 0)
          );
        }
      }
    }

    // 중복 제거 및 정렬
    const uniqueKeywords = [...new Set(keywords)].slice(0, 10); // 최대 10개
    
    console.log(`[키워드 추출] 정규화된 키워드: [${uniqueKeywords.join(', ')}]`);
    return uniqueKeywords;
  }

  /**
   * 여러 소스의 메타데이터 병합
   */
  public mergeMetadata(...sources: ExtractedMetadata[]): ExtractedMetadata {
    const merged: ExtractedMetadata = {};

    // 우선순위에 따라 병합 (뒤에 오는 것이 우선)
    for (const source of sources) {
      if (source.subject && !merged.subject) merged.subject = source.subject;
      if (source.grade && !merged.grade) merged.grade = source.grade;
      if (source.chapter && !merged.chapter) merged.chapter = source.chapter;
      if (source.lesson && !merged.lesson) merged.lesson = source.lesson;
      if (source.difficulty && !merged.difficulty) merged.difficulty = source.difficulty;
      if (source.documentType && !merged.documentType) merged.documentType = source.documentType;
      
      // 키워드는 합치기
      if (source.keywords) {
        merged.keywords = [...new Set([...(merged.keywords || []), ...source.keywords])];
      }
    }

    return merged;
  }

  /**
   * 메타데이터 유효성 검증
   */
  public validateMetadata(metadata: ExtractedMetadata): {
    isValid: boolean;
    missingFields: string[];
    confidence: number;
  } {
    const requiredFields = ['subject', 'grade'];
    const missingFields: string[] = [];
    
    for (const field of requiredFields) {
      if (!metadata[field as keyof ExtractedMetadata]) {
        missingFields.push(field);
      }
    }

    // 신뢰도 계산 (0-1)
    let confidence = 1.0;
    confidence -= missingFields.length * 0.25;
    confidence -= (!metadata.chapter ? 0.1 : 0);
    confidence -= (!metadata.lesson ? 0.1 : 0);
    confidence -= (!metadata.keywords || metadata.keywords.length === 0 ? 0.1 : 0);

    return {
      isValid: missingFields.length === 0,
      missingFields,
      confidence: Math.max(0, confidence)
    };
  }

  /**
   * 메타데이터를 검색 쿼리로 변환
   */
  public toSearchQuery(metadata: ExtractedMetadata): string {
    const parts: string[] = [];
    
    if (metadata.subject) parts.push(metadata.subject);
    if (metadata.grade) parts.push(`${metadata.grade}학년`);
    if (metadata.chapter) parts.push(metadata.chapter);
    if (metadata.lesson) parts.push(metadata.lesson);
    
    // 키워드 추가 (최대 3개)
    if (metadata.keywords && metadata.keywords.length > 0) {
      parts.push(...metadata.keywords.slice(0, 3));
    }

    return parts.join(' ');
  }

  /**
   * 교육과정 코드 생성 (표준화)
   */
  public generateCurriculumCode(metadata: ExtractedMetadata): string {
    const subject = metadata.subject || 'XX';
    const grade = metadata.grade || '0';
    const chapter = metadata.chapter ? metadata.chapter.match(/\d+/)?.[0] || '00' : '00';
    const lesson = metadata.lesson ? metadata.lesson.match(/\d+/)?.[0] || '00' : '00';
    
    // 예: KOR-3-01-02 (국어-3학년-1단원-2차시)
    const subjectCode = this.getSubjectCode(subject);
    return `${subjectCode}-${grade}-${chapter.padStart(2, '0')}-${lesson.padStart(2, '0')}`;
  }

  /**
   * 교과목 코드 변환
   */
  private getSubjectCode(subject: string): string {
    const codes: Record<string, string> = {
      '국어': 'KOR',
      '수학': 'MAT',
      '영어': 'ENG',
      '과학': 'SCI',
      '사회': 'SOC',
      '도덕': 'ETH',
      '체육': 'PHY',
      '음악': 'MUS',
      '미술': 'ART',
      '실과': 'PRA',
      '정보': 'INF'
    };
    
    return codes[subject] || 'ETC';
  }
}

// 싱글톤 인스턴스 내보내기
export default new MetadataExtractor();
