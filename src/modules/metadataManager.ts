import * as fs from 'fs';
import path from 'path';
import { DATA_DIR, SUBJECTS, GRADES } from '../config';
import { 
  CurriculumData, 
  MetadataFilter, 
  Chapter, 
  Lesson, 
  QuestionMetadata 
} from '../types/index';
import * as XLSX from 'xlsx';

/**
 * 교육과정 메타데이터 관리 클래스
 */
export class MetadataManager {
  private dataDir: string;
  private metadataFile: string;
  private curriculumData: CurriculumData;

  constructor(dataDir: string = DATA_DIR) {
    this.dataDir = dataDir;
    this.metadataFile = path.join(dataDir, 'metadata.json');
    this.curriculumData = {};

    // 데이터 디렉토리 생성
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  /**
   * 메타데이터 파일 로드
   */
  public loadMetadata(): CurriculumData {
    try {
      if (fs.existsSync(this.metadataFile)) {
        const data = fs.readFileSync(this.metadataFile, 'utf-8');
        this.curriculumData = JSON.parse(data);
        console.log(`메타데이터 로드 완료: ${Object.keys(this.curriculumData).length} 항목`);
      } else {
        console.log('메타데이터 파일이 존재하지 않아 새로 생성합니다.');
        this.curriculumData = this.createInitialMetadata();
        this.saveMetadata();
      }
    } catch (error) {
      console.error('메타데이터 로드 오류:', error);
      this.curriculumData = this.createInitialMetadata();
      this.saveMetadata();
    }

    return this.curriculumData;
  }

  /**
   * 메타데이터 파일 저장
   */
  public saveMetadata(): boolean {
    try {
      fs.writeFileSync(
        this.metadataFile,
        JSON.stringify(this.curriculumData, null, 2),
        'utf-8'
      );
      console.log('메타데이터 저장 완료');
      return true;
    } catch (error) {
      console.error('메타데이터 저장 오류:', error);
      return false;
    }
  }

  /**
   * 초기 메타데이터 구조 생성
   */
  private createInitialMetadata(): CurriculumData {
    const initialData: CurriculumData = {};

    for (const subject of SUBJECTS) {
      initialData[subject] = {};
      for (const grade of GRADES) {
        initialData[subject][grade] = {
          chapters: [],
          updated_at: null
        };
      }
    }

    return initialData;
  }

  /**
   * 엑셀 파일에서 교육과정 데이터 가져오기
   */
  public importFromExcel(excelPath: string, subject: string): boolean {
    try {
      // 엑셀 파일 로드
      const workbook = XLSX.readFile(excelPath);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<any>(worksheet);

      // 필요한 컬럼 확인
      const firstRow = data[0] || {};
      const requiredColumns = ['학년', '단원', '차시', '학습목표'];
      for (const col of requiredColumns) {
        if (!(col in firstRow)) {
          console.error(`필수 컬럼 '${col}'이 엑셀 파일에 없습니다.`);
          return false;
        }
      }

      // 데이터 구조화 및 저장
      for (const grade of GRADES) {
        const gradeData = data.filter((row: any) => row['학년'] === parseInt(grade));

        // 단원별 데이터 모으기
        const chapters: Chapter[] = [];
        const chaptersMap = new Map<string, any[]>();

        // 단원별로 데이터 그룹화
        gradeData.forEach((row: any) => {
          const chapterName = row['단원'];
          if (!chaptersMap.has(chapterName)) {
            chaptersMap.set(chapterName, []);
          }
          chaptersMap.get(chapterName)?.push(row);
        });

        // 그룹화된 데이터로 단원 구성
        Array.from(chaptersMap.entries()).forEach(([chapterName, rows], chapterIndex) => {
          const lessons: Lesson[] = rows.map((row: any) => ({
            lesson_id: row['차시'] !== undefined ? parseInt(row['차시']) : null,
            title: row['제목'] || `${row['단원']}-${row['차시']}차시`,
            objective: row['학습목표'] || '',
            keywords: row['키워드'] ? row['키워드'].split(',').map((k: string) => k.trim()) : []
          }));

          // 차시 번호로 정렬
          lessons.sort((a, b) => (a.lesson_id || 0) - (b.lesson_id || 0));

          chapters.push({
            chapter_id: chapterIndex + 1,
            title: chapterName,
            lessons
          });
        });

        // 기존 데이터가 없으면 초기화
        if (!this.curriculumData[subject]) {
          this.curriculumData[subject] = {};
        }

        if (!this.curriculumData[subject][grade]) {
          this.curriculumData[subject][grade] = {
            chapters: [],
            updated_at: null
          };
        }

        // 새 데이터로 업데이트
        this.curriculumData[subject][grade] = {
          chapters,
          updated_at: new Date().toISOString()
        };
      }

      // 변경사항 저장
      this.saveMetadata();
      console.log(`${subject} 교과 메타데이터 가져오기 완료`);
      return true;
    } catch (error) {
      console.error('엑셀 파일 가져오기 오류:', error);
      return false;
    }
  }

  /**
   * 등록된 교과 목록 반환
   */
  public getSubjects(): string[] {
    return Object.keys(this.curriculumData);
  }

  /**
   * 교과별 등록된 학년 목록 반환
   */
  public getGrades(subject: string): string[] {
    if (this.curriculumData[subject]) {
      return Object.keys(this.curriculumData[subject]);
    }
    return [];
  }

  /**
   * 교과, 학년별 단원 목록 반환
   */
  public getChapters(subject: string, grade: string): Chapter[] {
    if (
      this.curriculumData[subject] && 
      this.curriculumData[subject][grade]
    ) {
      return this.curriculumData[subject][grade].chapters || [];
    }
    return [];
  }

  /**
   * 교과, 학년, 단원별 차시 목록 반환
   */
  public getLessons(subject: string, grade: string, chapterId: number): Lesson[] {
    const chapters = this.getChapters(subject, grade);
    for (const chapter of chapters) {
      if (chapter.chapter_id === chapterId) {
        return chapter.lessons || [];
      }
    }
    return [];
  }

  /**
   * 교과, 학년, 단원, 차시의 상세 정보 반환
   */
  public getLessonInfo(
    subject: string, 
    grade: string, 
    chapterId: number, 
    lessonId: number
  ): { 
    chapter_title: string,
    title: string, 
    objective: string, 
    keywords: string[] 
  } | null {
    const chapters = this.getChapters(subject, grade);
    
    // 단원 찾기
    for (const chapter of chapters) {
      if (chapter.chapter_id === chapterId) {
        // 차시 찾기
        for (const lesson of chapter.lessons) {
          if (lesson.lesson_id === lessonId) {
            return {
              chapter_title: chapter.title,
              title: lesson.title || '',
              objective: lesson.objective || '',
              keywords: lesson.keywords || []
            };
          }
        }
      }
    }
    
    return null;
  }

  /**
   * 새 단원 추가
   */
  public addChapter(subject: string, grade: string, title: string): boolean {
    if (!this.curriculumData[subject]) {
      this.curriculumData[subject] = {};
    }

    if (!this.curriculumData[subject][grade]) {
      this.curriculumData[subject][grade] = {
        chapters: [],
        updated_at: null
      };
    }

    const chapters = this.curriculumData[subject][grade].chapters || [];
    
    // 다음 chapter_id 결정
    const maxId = chapters.reduce((max, ch) => Math.max(max, ch.chapter_id), 0);
    const newChapter: Chapter = {
      chapter_id: maxId + 1,
      title,
      lessons: []
    };

    chapters.push(newChapter);
    this.curriculumData[subject][grade].chapters = chapters;
    this.curriculumData[subject][grade].updated_at = new Date().toISOString();

    return this.saveMetadata();
  }

  /**
   * 새 차시 추가
   */
  public addLesson(
    subject: string,
    grade: string,
    chapterId: number,
    lessonId: number,
    title: string,
    objective: string,
    keywords: string[] = []
  ): boolean {
    const chapters = this.getChapters(subject, grade);
    for (let i = 0; i < chapters.length; i++) {
      if (chapters[i].chapter_id === chapterId) {
        const newLesson: Lesson = {
          lesson_id: lessonId,
          title,
          objective,
          keywords
        };

        const lessons = chapters[i].lessons || [];

        // 중복 차시 ID 체크
        for (const lesson of lessons) {
          if (lesson.lesson_id === lessonId) {
            console.warn(`이미 존재하는 차시 ID: ${lessonId}`);
            return false;
          }
        }

        lessons.push(newLesson);
        chapters[i].lessons = lessons.sort((a, b) => (a.lesson_id || 0) - (b.lesson_id || 0));
        this.curriculumData[subject][grade].chapters = chapters;
        this.curriculumData[subject][grade].updated_at = new Date().toISOString();

        return this.saveMetadata();
      }
    }

    console.warn(`단원 ID ${chapterId}를 찾을 수 없습니다.`);
    return false;
  }

  /**
   * 메타데이터 필터 생성
   */
  public getMetadataFilters(
    subject?: string,
    grade?: string,
    chapterId?: number,
    lessonId?: number
  ): MetadataFilter {
    const filters: MetadataFilter = {};

    if (subject) filters.subject = subject;
    if (grade) filters.grade = grade;
    if (chapterId) filters.chapter_id = chapterId;
    if (lessonId) filters.lesson_id = lessonId;

    return filters;
  }

  /**
   * 메타데이터 검색
   */
  public searchMetadata(query: string, filters: MetadataFilter = {}): any[] {
    const results: any[] = [];

    const subjectFilter = filters.subject;
    const gradeFilter = filters.grade;
    const chapterIdFilter = filters.chapter_id;
    const lessonIdFilter = filters.lesson_id;

    const subjects = subjectFilter ? [subjectFilter] : this.getSubjects();

    for (const subject of subjects) {
      const grades = gradeFilter ? [gradeFilter] : this.getGrades(subject);

      for (const grade of grades) {
        const chapters = this.getChapters(subject, grade);

        for (const chapter of chapters) {
          if (chapterIdFilter && chapter.chapter_id !== parseInt(chapterIdFilter.toString())) {
            continue;
          }

          const lessons = chapter.lessons || [];

          for (const lesson of lessons) {
            if (lessonIdFilter && lesson.lesson_id !== parseInt(lessonIdFilter.toString())) {
              continue;
            }

            // 검색어로 필터링
            const lowerQuery = query.toLowerCase();
            if (
              chapter.title.toLowerCase().includes(lowerQuery) ||
              (lesson.title && lesson.title.toLowerCase().includes(lowerQuery)) ||
              (lesson.objective && lesson.objective.toLowerCase().includes(lowerQuery)) ||
              (lesson.keywords && lesson.keywords.some(kw => kw.toLowerCase().includes(lowerQuery)))
            ) {
              results.push({
                subject,
                grade,
                chapter_id: chapter.chapter_id,
                chapter_title: chapter.title,
                lesson_id: lesson.lesson_id,
                lesson_title: lesson.title || '',
                objective: lesson.objective || '',
                keywords: lesson.keywords || []
              });
            }
          }
        }
      }
    }

    return results;
  }

  /**
   * 질문 생성을 위한 메타데이터 생성
   */
  public generateMetadataForQuestion(
    subject: string,
    grade: string,
    chapterId: number,
    lessonId: number
  ): QuestionMetadata {
    const lessonInfo = this.getLessonInfo(subject, grade, chapterId, lessonId);

    const result: QuestionMetadata = {
      subject,
      grade,
      chapter_id: chapterId,
      lesson_id: lessonId,
      chapter_title: lessonInfo?.chapter_title || '',
      lesson_title: lessonInfo?.title || '',
      keywords: lessonInfo?.keywords || [],
      question_type: 'unknown', // 기본값 설정
      fileName: 'unknown', // 기본값 설정
    };

    return result;
  }
}

// 싱글톤 인스턴스
const metadataManager = new MetadataManager();
export default metadataManager;