import React from 'react';
import { Link } from 'react-router-dom';
import './HomePage.css';

const HomePage: React.FC = () => {
  return (
    <div className="home-page">
      {/* 움직이는 이모티콘 */}
      <div className="floating-emojis">
        <div className="floating-emoji">📚</div>
        <div className="floating-emoji">✨</div>
        <div className="floating-emoji">🎓</div>
        <div className="floating-emoji">💡</div>
        <div className="floating-emoji">🚀</div>
        <div className="floating-emoji">⭐</div>
      </div>

      <div className="home-content">
        <div className="container py-5">
          <div className="row justify-content-center">
            <div className="col-md-10">
              <div className="text-center mb-5 fade-in">
                <h1 className="home-title display-4 fw-bold">알공 국사과 대화셋 자동생성 시스템</h1>
                <p className="home-subtitle">
                  AI를 활용한 초등학교 교육과정 기반 문제 자동 생성 시스템
                </p>
              </div>

              <div className="row justify-content-center mb-5">
                <div className="col-md-6 fade-in-delay-1">
                  <div className="feature-card h-100">
                    <div className="card-body text-center p-4">
                      <div className="mb-4">
                        <div className="feature-icon">⚡</div>
                      </div>
                      <h3 className="card-title h4 mb-3">📝 문제 자동 생성</h3>
                      <p className="card-text mb-4">
                        PDF 문서를 업로드하여 다양한 유형의 문제를 자동으로 생성합니다.
                      </p>
                      <Link to="/generate" className="home-btn">
                        문제 생성하기 🎯
                      </Link>
                    </div>
                  </div>
                </div>
              </div>

              <div className="home-card fade-in-delay-2">
                <div className="card-header bg-transparent border-0 p-4">
                  <h2 className="h4 mb-0 text-center">🌟 프로젝트 소개</h2>
                </div>
                <div className="card-body p-4">
                  <div className="row g-4">
                    <div className="col-md-4 text-center fade-in-delay-3">
                      <div className="feature-icon mb-3">🎯</div>
                      <h5>맞춤형 학습</h5>
                      <p className="small">
                        초등학교 교육과정에 맞는 다양한 유형의 문제 자동 생성
                      </p>
                    </div>
                    <div className="col-md-4 text-center fade-in-delay-3">
                      <div className="feature-icon mb-3">🤖</div>
                      <h5>AI 기반 솔루션</h5>
                      <p className="small">
                        방대한 문제, 힌트, 해설 콘텐츠를 AI로 자동 생성
                      </p>
                    </div>
                    <div className="col-md-4 text-center fade-in-delay-3">
                      <div className="feature-icon mb-3">📱</div>
                      <h5>실시간 업데이트</h5>
                      <p className="small">
                        커리큘럼 개정 시마다 즉시 최신화된 콘텐츠 제공
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
