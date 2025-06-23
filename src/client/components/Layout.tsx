import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Layout.css';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();

  return (
    <div className="app-container">
      {/* 헤더 */}
      <header className="modern-header">
        <nav className="modern-nav">
          <div className="modern-nav-container">
            <Link className="modern-logo" to="/">
              📚 알공 국사과 대화셋 자동생성 시스템
            </Link>
            <ul className="modern-nav-menu">
              <li>
                <Link className={`modern-nav-link${location.pathname === '/' ? ' active' : ''}`} to="/">
                  홈
                </Link>
              </li>
              <li>
                <Link className={`modern-nav-link${location.pathname === '/generate' ? ' active' : ''}`} to="/generate">
                  문제 생성
                </Link>
              </li>
            </ul>
          </div>
        </nav>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="main-content">
        <div className="content-container">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
