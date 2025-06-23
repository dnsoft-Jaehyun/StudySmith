/**
 * 한글/영어 텍스트 토크나이징을 위한 유틸리티
 */

// 한글 자모음 정규식
const HANGUL_REGEX = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;

// 불용어 목록
const STOP_WORDS = new Set([
  // 한글 불용어
  '이', '그', '저', '것', '수', '등', '들', '및', '에서', '으로', '에게', '뿐', '의', '가', '이다', '입니다',
  // 영어 불용어
  'a', 'an', 'the', 'in', 'on', 'at', 'for', 'to', 'of', 'with', 'by'
]);

/**
 * 텍스트를 토큰으로 분리
 */
export function tokenize(text: string): string[] {
  // 1. 소문자 변환
  const normalized = text.toLowerCase();
  
  // 2. 특수문자 제거 및 공백으로 분리
  const words = normalized
    .replace(/[^a-z0-9가-힣\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 0);
  
  // 3. 불용어 제거
  const tokens = words.filter(word => !STOP_WORDS.has(word));
  
  // 4. n-gram 생성 (한글의 경우)
  const ngrams: string[] = [];
  tokens.forEach(token => {
    if (HANGUL_REGEX.test(token)) {
      // 2-gram과 3-gram 추가
      for (let i = 0; i < token.length - 1; i++) {
        if (i < token.length - 2) {
          ngrams.push(token.slice(i, i + 3));  // 3-gram
        }
        ngrams.push(token.slice(i, i + 2));    // 2-gram
      }
    }
  });
  
  // 5. 최종 토큰 목록 반환
  return [...new Set([...tokens, ...ngrams])];
}

/**
 * 두 문자열 간의 유사도 계산 (Jaccard 유사도)
 */
export function calculateSimilarity(text1: string, text2: string): number {
  const tokens1 = new Set(tokenize(text1));
  const tokens2 = new Set(tokenize(text2));
  
  const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
  const union = new Set([...tokens1, ...tokens2]);
  
  return intersection.size / union.size;
}

/**
 * 텍스트에서 키워드 추출
 */
export function extractKeywords(text: string, maxKeywords: number = 10): string[] {
  const tokens = tokenize(text);
  const freqMap = new Map<string, number>();
  
  // 토큰 빈도 계산
  tokens.forEach(token => {
    freqMap.set(token, (freqMap.get(token) || 0) + 1);
  });
  
  // 빈도 기준 정렬 및 상위 키워드 반환
  return [...freqMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([token]) => token);
} 