import React, { useState, useRef } from 'react';
import { UploadCloud, Image as ImageIcon, Settings2, Download, Copy, RefreshCw, Layers, FileText } from 'lucide-react';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import * as pdfjsLib from 'pdfjs-dist';
import { removeWatermark, FillMethod } from './lib/imageLogic';
import { motion, AnimatePresence } from 'motion/react';

// Configure PDF.js worker using unpkg CDN matching the installed version
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// Default configuration for the NotebookLM watermark region
const DEFAULT_CONFIG = {
  width: 150,
  height: 30,
  marginX: 0,
  marginY: 0,
  method: 'stretch-left' as FillMethod,
};

interface ImgData {
  id: string;
  originalUrl: string;
  processedUrl: string | null;
  size: { w: number; h: number };
  file: File;
}

export default function App() {
  const [images, setImages] = useState<ImgData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [isPDFExtracting, setIsPDFExtracting] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [config, setConfig] = useState(DEFAULT_CONFIG);

  const handleFiles = async (files: FileList | File[]) => {
    setIsPDFExtracting(true);
    const loadedImages: ImgData[] = [];
    const filesArray = Array.from(files);

    try {
      for (const file of filesArray) {
        if (loadedImages.length >= 15) break;

        const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        if (isPDF) {
          try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const pagesToExtract = Math.min(pdf.numPages, 15 - loadedImages.length);

            for (let i = 1; i <= pagesToExtract; i++) {
              const page = await pdf.getPage(i);
              const viewport = page.getViewport({ scale: 1.5 }); // High-quality but memory-safe rendering
              const canvas = document.createElement('canvas');
              const context = canvas.getContext('2d');
              if (context) {
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvasContext: context, viewport, canvas }).promise;
                const originalUrl = canvas.toDataURL('image/png');
                loadedImages.push({
                  id: Math.random().toString(36).substring(7),
                  file,
                  originalUrl,
                  processedUrl: null,
                  size: { w: viewport.width, h: viewport.height }
                });
              }
            }
          } catch (pdfErr) {
            console.error("PDF Parsing error:", pdfErr);
            alert(`${file.name} PDF 파일을 읽는 중 오류가 발생했습니다. 암호화되었거나 깨진 파일이 아닌지 확인해주세요.`);
          }
        } else if (file.type.startsWith('image/')) {
          await new Promise<void>((resolve) => {
            const reader = new FileReader();
            reader.onload = (event) => {
              const url = event.target?.result as string;
              const img = new Image();
              img.onload = () => {
                loadedImages.push({
                  id: Math.random().toString(36).substring(7),
                  file,
                  originalUrl: url,
                  processedUrl: null,
                  size: { w: img.width, h: img.height }
                });
                resolve();
              };
              img.src = url;
            };
            reader.readAsDataURL(file);
          });
        }
      }
      setImages(prev => {
        return [...prev, ...loadedImages].slice(0, 15);
      });
    } catch (error) {
      console.error("File loading failed", error);
      alert("파일을 로드하는 중 알 수 없는 오류가 발생했습니다.");
    } finally {
      setIsPDFExtracting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const processImageRequest = async () => {
    if (images.length === 0) return;
    setIsProcessing(true);
    try {
      const processed = await Promise.all(
        images.map(async (img) => {
          const resultUrl = await removeWatermark(
            img.originalUrl,
            config.width,
            config.height,
            config.marginX,
            config.marginY,
            config.method
          );
          return { ...img, processedUrl: resultUrl };
        })
      );
      setImages(processed);
    } catch (err) {
      console.error(err);
      alert('이미지 처리 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadResult = (img: ImgData, index: number) => {
    if (!img.processedUrl) return;
    const a = document.createElement('a');
    a.href = img.processedUrl;
    a.download = `cleaned-slide-${index + 1}-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadAll = async () => {
    setIsZipping(true);
    try {
      const zip = new JSZip();
      let hasFiles = false;

      images.forEach((img, i) => {
        if (img.processedUrl) {
          const base64Data = img.processedUrl.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
          zip.file(`cleaned-slide-${i + 1}.png`, base64Data, { base64: true });
          hasFiles = true;
        }
      });

      if (hasFiles) {
        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cleaned-slides-all-${Date.now()}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("ZIP creation failed", error);
      alert("압축 파일 생성에 실패했습니다.");
    } finally {
      setIsZipping(false);
    }
  };

  const downloadAsPDF = async () => {
    const processedImages = images.filter(img => img.processedUrl);
    if (processedImages.length === 0) {
      alert("워터마크가 제거된 이미지가 없습니다. '로고 지우기'를 먼저 진행해주세요.");
      return;
    }

    setIsExportingPDF(true);
    try {
      const firstImg = processedImages[0];
      const doc = new jsPDF({
        orientation: firstImg.size.w > firstImg.size.h ? 'landscape' : 'portrait',
        unit: 'px',
        format: [firstImg.size.w, firstImg.size.h]
      });

      processedImages.forEach((img, i) => {
        if (!img.processedUrl) return;
        const w = img.size.w;
        const h = img.size.h;
        const isLandscape = w > h;

        if (i > 0) {
          doc.addPage([w, h], isLandscape ? 'landscape' : 'portrait');
        }
        doc.addImage(img.processedUrl, 'PNG', 0, 0, w, h);
      });

      doc.save(`cleaned-slides-all-${Date.now()}.pdf`);
    } catch (error) {
      console.error("PDF export failed", error);
      alert("PDF 파일 생성 중 오류가 발생했습니다.");
    } finally {
      setIsExportingPDF(false);
    }
  };

  return (
    <div className="min-h-screen font-sans selection:bg-blue-500/30 text-[#F8FAFC]">
      <div className="mesh-bg fixed inset-0 pointer-events-none"></div>
      
      <div className="relative flex flex-col h-full max-w-[1600px] w-full mx-auto p-4 sm:p-8">
        <header className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-md shadow-blue-500/20" style={{ background: 'var(--emerald-gradient)' }}>
              <Layers size={20} strokeWidth={2.5} color="white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
              Clean Slide
            </h1>
          </div>
          <div className="text-sm font-medium opacity-70 hidden sm:block">
            NotebookLM 워터마크 자동 제거 도구
          </div>
        </header>

        <main className="flex-1 flex flex-col gap-5">
          {isPDFExtracting ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="glass-panel p-12 text-center max-w-3xl mx-auto w-full mt-10 flex flex-col items-center justify-center gap-6 min-h-[350px]"
            >
              <RefreshCw size={48} className="animate-spin text-blue-500 animate-duration-1000" />
              <div className="space-y-2">
                <h3 className="text-xl font-bold">PDF 파일에서 고화질 슬라이드 추출 중...</h3>
                <p className="opacity-70 text-sm">
                  PDF 각 페이지를 디지털 이미지로 선명하게 변환하는 작업 중입니다. 잠시만 기다려주세요.
                </p>
              </div>
            </motion.div>
          ) : images.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-panel p-8 sm:p-12 text-center max-w-3xl mx-auto w-full mt-4"
            >
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold mb-3">
                  슬라이드 이미지를 깨끗하게
                </h2>
                <p className="opacity-70">
                  NotebookLM 등에서 생성된 슬라이드 우측 하단의 워터마크를
                  브라우저 내부에서 즉시 제거합니다 (최대 15장 동시 처리).
                </p>
              </div>

              <div
                className="drop-zone py-12 px-6 flex flex-col items-center justify-center gap-4 cursor-pointer mb-6"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center text-[#4364F7] mb-2 group-hover:scale-110 transition-all duration-300">
                  <UploadCloud size={32} />
                </div>
                <p className="text-lg font-semibold">
                  이미지 또는 PDF 파일 드래그 앤 드롭
                </p>
                <p className="text-sm opacity-50">
                  또는 클릭하여 파일 선택 (PNG, JPG, PDF / 최대 15장)
                </p>
                <input
                  type="file"
                  className="hidden"
                  accept="image/png, image/jpeg, application/pdf"
                  multiple
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                />
              </div>
              
              <div className="mt-6 text-center text-sm opacity-50 font-medium">
                ✓ 서버로 파일이 전혀 전송되지 않는 100% 안전한 브라우저 내 로컬 처리
              </div>
            </motion.div>
          ) : (
          <div className="flex flex-col gap-6">
            {/* Top Configuration Bar */}
            <div className="glass-panel p-3 sm:p-5 shadow-xl sticky top-4 z-20">
              <div className="flex flex-col lg:flex-row gap-5 justify-between items-start lg:items-center">
                
                {/* 칠하기 방식 */}
                <div className="w-full lg:w-auto flex-shrink-0">
                  <label className="block text-[10px] uppercase opacity-50 font-bold mb-1">
                    칠하기 방식
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { id: 'stretch-left', label: '좌측 색상 (추천)' },
                      { id: 'stretch-top', label: '상단 색상' },
                      { id: 'solid', label: '단색 혼합' },
                    ].map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setConfig({ ...config, method: m.id as FillMethod })}
                        className={`text-[11px] px-3 py-1.5 rounded-lg border transition-all ${
                          config.method === m.id
                            ? 'border-[#6FB1FC] bg-[#0052D4]/20 text-white font-medium'
                            : 'border-white/10 hover:border-white/30 hover:bg-white/5 opacity-80 hover:opacity-100'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 슬라이더 (크기 조정) */}
                <div className="flex-1 w-full grid grid-cols-2 xl:grid-cols-4 gap-x-5 gap-y-3 px-0 lg:px-4 border-t lg:border-t-0 lg:border-l border-white/10 pt-3 lg:pt-0 lg:pl-5">
                  {[
                    { key: 'width', label: '가로 너비 (px)', min: 10, max: 400 },
                    { key: 'height', label: '세로 높이 (px)', min: 10, max: 200 },
                    { key: 'marginX', label: '우측 여백 (px)', min: 0, max: 200 },
                    { key: 'marginY', label: '하단 여백 (px)', min: 0, max: 200 },
                  ].map((slider) => (
                    <div key={slider.key}>
                      <div className="flex justify-between text-[10px] opacity-70 mb-1 font-medium">
                        <span>{slider.label}</span>
                        <span>{config[slider.key as keyof typeof config]}</span>
                      </div>
                      <input
                        type="range"
                        min={slider.min}
                        max={slider.max}
                        value={config[slider.key as keyof typeof config]}
                        onChange={(e) => setConfig({ ...config, [slider.key]: parseInt(e.target.value) })}
                        className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
                        style={{
                          accentColor: '#4364F7' // Fallback for standard browsers
                        }}
                      />
                    </div>
                  ))}
                </div>

                {/* 액션 버튼 */}
                <div className="w-full lg:w-auto flex-shrink-0 flex flex-wrap gap-2 pt-3 lg:pt-0 border-t border-white/10 lg:border-none">
                  {images.some(i => i.processedUrl) && (
                    <>
                      <button
                        onClick={downloadAll}
                        disabled={isZipping || isExportingPDF}
                        className="bg-[#11998e] hover:bg-[#38ef7d] disabled:opacity-70 disabled:cursor-not-allowed text-white px-3 py-2 rounded-xl text-xs font-semibold shadow-lg transition-colors flex items-center justify-center gap-1.5"
                      >
                        {isZipping ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                        {isZipping ? '압축 중...' : '이미지 ZIP'}
                      </button>
                      
                      <button
                        onClick={downloadAsPDF}
                        disabled={isZipping || isExportingPDF}
                        className="bg-[#833ab4] hover:bg-[#fcb045] disabled:opacity-70 disabled:cursor-not-allowed text-white px-3 py-2 rounded-xl text-xs font-semibold shadow-lg transition-colors flex items-center justify-center gap-1.5"
                      >
                        {isExportingPDF ? <RefreshCw size={14} className="animate-spin" /> : <FileText size={14} />}
                        {isExportingPDF ? 'PDF 생성 중...' : 'PDF 저장'}
                      </button>
                    </>
                  )}
                  <button
                    onClick={processImageRequest}
                    disabled={isProcessing}
                    className="btn-primary flex-1 lg:flex-none px-4 py-2 font-semibold flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed text-xs"
                  >
                    {isProcessing ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      <RefreshCw size={14} />
                    )}
                    {images.some(i => i.processedUrl) ? '다시 처리' : '로고 지우기'}
                  </button>

                  <button
                    onClick={() => {
                      setImages([]);
                    }}
                    className="flex-1 lg:flex-none bg-white/5 text-white border border-white/10 px-3 py-2 rounded-xl text-xs font-medium hover:bg-white/10 transition-colors"
                  >
                    다른 파일 ({images.length}/15)
                  </button>
                </div>

              </div>
            </div>

            {/* Preview Areas (List of side-by-sides) */}
            <div className="flex flex-col gap-8 pb-10">
              {images.map((img, index) => (
                <div key={img.id} className="flex flex-col gap-2">
                  <div className="text-[11px] uppercase tracking-widest opacity-60 font-bold px-2 flex justify-between">
                    <span>Image {index + 1}</span>
                    <span>{img.size.w} x {img.size.h}</span>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[300px]">
                    <div className="flex flex-col h-full">
                      <div className="glass-panel p-3 flex-1 flex flex-col min-h-[250px]">
                        <div className="bg-black/40 rounded-xl flex-1 flex items-center justify-center p-2 border border-white/5 relative overflow-hidden">
                          <div className="relative inline-block max-w-full">
                            <img
                              src={img.originalUrl}
                              alt={`Original ${index + 1}`}
                              className="max-w-full max-h-[500px] block shadow-sm rounded-md"
                            />
                            
                            {img.size.w > 0 && (
                              <svg
                                viewBox={`0 0 ${img.size.w} ${img.size.h}`}
                                className="absolute inset-0 w-full h-full pointer-events-none"
                                preserveAspectRatio="xMidYMid meet"
                              >
                                <rect
                                  x={Math.max(0, img.size.w - config.width - config.marginX)}
                                  y={Math.max(0, img.size.h - config.height - config.marginY)}
                                  width={config.width}
                                  height={config.height}
                                  fill="rgba(239, 68, 68, 0.15)"
                                  stroke="rgb(239, 68, 68)"
                                  strokeWidth={Math.max(2, img.size.w / 300)}
                                  strokeDasharray={`${Math.max(4, img.size.w/150)},${Math.max(4, img.size.w/150)}`}
                                />
                              </svg>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col h-full">
                      <div className="glass-panel p-3 flex-1 flex flex-col min-h-[250px]">
                        <div className="bg-black/40 rounded-xl flex-1 flex items-center justify-center p-2 border border-white/5 relative shadow-inner overflow-hidden">
                          {isProcessing ? (
                            <div className="flex flex-col items-center text-[#4364F7] gap-3">
                              <RefreshCw size={24} className="animate-spin" />
                              <span className="font-medium text-xs">처리 중...</span>
                            </div>
                          ) : img.processedUrl ? (
                            <div className="relative inline-block max-w-full">
                              <img
                                src={img.processedUrl}
                                alt={`Processed ${index + 1}`}
                                className="max-w-full max-h-[500px] block shadow-sm rounded-md"
                              />
                              <div className="absolute top-2 right-2 group">
                                <button
                                  onClick={() => downloadResult(img, index)}
                                  className="bg-[#0F172A]/80 backdrop-blur text-white shadow-xl hover:bg-[#11998e] p-2.5 rounded-xl flex items-center justify-center transition-all duration-200 border border-white/10 group-hover:border-[#38ef7d]"
                                  title="다운로드"
                                >
                                  <Download size={16} />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="text-white/30 text-xs flex flex-col items-center gap-2">
                               <Copy size={20} className="opacity-50" />
                               <p>우측 상단의 "로고 지우기"를 눌러주세요</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

          </div>
        )}
      </main>
      </div>
      
      <footer className="w-full relative z-10 max-w-[1600px] mx-auto p-4 sm:px-8 mt-auto flex justify-between text-[11px] opacity-40 uppercase tracking-widest font-medium">
        <div>NotebookLM Logo Remover v1.0.0</div>
        <div className="hidden sm:block">&copy; 2026 AI Design Lab.</div>
      </footer>
    </div>
  );
}
