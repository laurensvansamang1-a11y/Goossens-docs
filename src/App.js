import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Camera, Search, FolderOpen, ChevronLeft, Upload, CheckCircle, Calendar, Image as ImageIcon, Plus, Sparkles, FileText, Loader2, X, Wifi, WifiOff, Cloud, CloudOff, ListChecks, MessageSquare, Send, PenTool, Clock, Paperclip, AlertTriangle, Trash2, Mic, Printer, Eraser, Check, Settings, Video, Square, Maximize2 } from "lucide-react";

const DB_NAME = "KeukenAppDB_V4";
const STORE_NAME = "projects";

const openDB = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE_NAME);
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const saveToDB = async (data) => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(data, "all_projects");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) { console.error("Save DB Error:", e); }
};

const loadFromDB = async () => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get("all_projects");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (e) { return null; }
};

// Hoge Kwaliteit Compressie (2400px)
const compressImage = (base64Str, maxWidth = 2400, quality = 0.95) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;
      if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
  });
};

// --- NIEUW: HAPTISCHE FEEDBACK ---
const triggerVibration = (pattern = 50) => {
  if (navigator.vibrate) {
    // pattern kan een enkel getal (50ms) zijn of een array ([50, 100, 50])
    navigator.vibrate(pattern);
  }
};

const SignaturePad = ({ onSave, onClear, initialSignature }) => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && initialSignature) {
      const ctx = canvas.getContext("2d");
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = initialSignature;
    }
  }, [initialSignature]);

  const getCoords = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) { clientX = e.touches[0].clientX; clientY = e.touches[0].clientY; } 
    else { clientX = e.clientX; clientY = e.clientY; }
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { x, y } = getCoords(e);
    ctx.beginPath(); ctx.moveTo(x, y);
    setIsDrawing(true); setHasDrawn(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault(); 
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const { x, y } = getCoords(e);
    ctx.lineTo(x, y); ctx.stroke();
    ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
  };

  const stopDrawing = () => { if (isDrawing) setIsDrawing(false); };
  
  const clearSignature = () => {
    triggerVibration(); // Feedback bij wissen
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false); onClear();
  };
  
  const confirmSignature = () => { 
      if (hasDrawn) {
          triggerVibration([50, 50, 50]); // Duidelijke feedback bij succes
          onSave(canvasRef.current.toDataURL("image/png")); 
      }
  };

  return (
    <div className="space-y-3 print:hidden">
      <div className="border-2 border-slate-300 rounded-2xl overflow-hidden bg-white touch-none shadow-inner">
        <canvas ref={canvasRef} width={800} height={400} className="w-full h-[200px] sm:h-[250px] bg-slate-50 cursor-crosshair touch-none" onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} />
      </div>
      <div className="flex flex-col sm:flex-row justify-between items-stretch gap-3 mt-3">
        <button onClick={clearSignature} type="button" className="flex-1 flex justify-center items-center gap-2 px-4 py-4 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 text-sm font-bold transition-colors"><Eraser size={18} /> Wissen</button>
        <button onClick={confirmSignature} disabled={!hasDrawn} type="button" className="flex-1 flex justify-center items-center gap-2 px-4 py-4 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:bg-slate-300 disabled:text-slate-500 text-sm font-bold transition-colors shadow-md"><Check size={18} /> Bevestigen</button>
      </div>
    </div>
  );
};

const executeAI = async (promptText, mimeType = null, base64Data = null, forceJson = false) => {
  const url = "/.netlify/functions/ai-scanner";

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ promptText, mimeType, base64Data, forceJson })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Fout bij de server.");
    return data.result;
  } catch (error) {
    throw new Error(`Connectiefout: ${error.message}`);
  }
};

function App() {
  const [projects, setProjects] = useState([]);
  const [activeView, setActiveView] = useState("list");
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [notification, setNotification] = useState(null); 
  const projectsRef = useRef(projects);
  
  useEffect(() => { projectsRef.current = projects; }, [projects]);

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const [analyzingPhotos, setAnalyzingPhotos] = useState({});
  const [reportConfig, setReportConfig] = useState({ isOpen: false, type: "", title: "" });
  const [generatedReport, setGeneratedReport] = useState("");
  const [reportStatus, setReportStatus] = useState("idle");

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([{ role: "assistant", text: "Hoi! Ik ben de AI Montage Assistent. Stel hier je technische vraag!" }]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isNoteLoading, setIsNoteLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [chatImage, setChatImage] = useState(null);
  const chatFileInputRef = useRef(null);
  const [isTranslating, setIsTranslating] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newProjectData, setNewProjectData] = useState({ name: "", id: "", date: "", duration: "1 dag" });
  const [projectToDelete, setProjectToDelete] = useState(null);
  const [isMagicLoading, setIsMagicLoading] = useState(false);

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  // --- NIEUW: LIGHTBOX STATE ---
  const [fullScreenMedia, setFullScreenMedia] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const magicUploadRef = useRef(null);
  const fileInputRef = useRef(null);
  
  // --- NIEUW: AUTO-SAVE TIMER REF ---
  const saveTimeoutRef = useRef(null);

  const activeProject = projects.find((p) => String(p.id) === String(selectedProjectId));

  const getDerivedStatus = (currentStatus, projectDate) => {
    if (currentStatus !== "Gepland") return currentStatus;
    const today = new Date().toISOString().split("T")[0];
    return projectDate <= today ? "In uitvoering" : "Gepland";
  };

  const handlePrintPDF = () => {
    window.print();
  };

  const closeOverlay = () => {
    triggerVibration(); // Lichte tik bij sluiten
    if (window.history.length > 1) {
      window.history.back(); 
    } else {
      window.location.replace("#"); 
    }
  };

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;

      setShowAddModal(false);
      setIsCameraOpen(false); 
      setProjectToDelete(null);
      setIsChatOpen(false);
      setReportConfig(prev => ({ ...prev, isOpen: false }));
      setFullScreenMedia(null); // Sluit ook de lightbox af bij navigatie

      if (hash.startsWith("#project/")) {
        const parts = hash.split("/");
        const id = parts[1];
        const action = parts[2];
        setSelectedProjectId(id);
        setActiveView("detail");
        
        if (action === "chat") setIsChatOpen(true);
        if (action === "camera") setIsCameraOpen(true);
        if (action === "delete") {
            const projToDel = projectsRef.current.find((p) => String(p.id) === String(id));
            if(projToDel) setProjectToDelete(projToDel);
        }
        if (action === "media" && parts[3]) {
            const mediaId = parts[3];
            const proj = projectsRef.current.find((p) => String(p.id) === String(id));
            if(proj) {
                const mediaItem = proj.photos.find(m => String(m.id) === String(mediaId));
                if(mediaItem) setFullScreenMedia(mediaItem);
            }
        }
        
      } else if (hash === "#new-project") {
        setShowAddModal(true);
        setActiveView("list");
      } else if (hash === "#chat") {
        setIsChatOpen(true);
        setActiveView("list");
      } else {
        setActiveView("list");
        setSelectedProjectId(null);
      }
    };

    window.addEventListener("hashchange", handleHashChange);
    handleHashChange(); 
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (isInitialized && activeView === "detail" && selectedProjectId && !activeProject) {
      window.location.replace("#");
    }
  }, [isInitialized, activeView, selectedProjectId, activeProject]);

  const handleProjectClick = (id) => { window.location.hash = `project/${id}`; };
  
  const handleBackToList = () => {
    triggerVibration();
    if (window.history.length > 1) {
        window.history.back();
    } else {
        window.location.hash = "";
    }
  };

  useEffect(() => {
    const initData = async () => {
      const savedData = await loadFromDB();
      if (savedData && savedData.length > 0) {
        const updatedData = savedData.map((p) => ({ ...p, status: getDerivedStatus(p.status, p.date) }));
        setProjects(updatedData.sort((a, b) => new Date(a.date) - new Date(b.date)));
      }
      setIsInitialized(true);
    };
    initData();

    const handleNetwork = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", handleNetwork); window.addEventListener("offline", handleNetwork);
    return () => { window.removeEventListener("online", handleNetwork); window.removeEventListener("offline", handleNetwork); };
  }, []);

  useEffect(() => {
    if (isOnline && isInitialized) {
      const hasPendingPhotos = projectsRef.current.some((p) => p.photos.some((photo) => photo.syncStatus === "pending"));
      if (hasPendingPhotos) {
        const syncData = async () => {
          setIsSyncing(true); await new Promise((resolve) => setTimeout(resolve, 2000));
          const updated = projectsRef.current.map((p) => ({ ...p, photos: p.photos.map((photo) => photo.syncStatus === "pending" ? { ...photo, syncStatus: "synced" } : photo) }));
          await saveToDB(updated); setProjects(updated); setIsSyncing(false);
          showNotification("☁️ Verbinding hersteld: offline foto's zijn geüpload!", "success");
        };
        syncData();
      }
    }
  }, [isOnline, isInitialized]);

  const filteredProjects = useMemo(() => {
    if (!searchQuery) return projects;
    const lowerQuery = searchQuery.toLowerCase();
    return projects.filter((p) => p.name.toLowerCase().includes(lowerQuery) || String(p.id).toLowerCase().includes(lowerQuery));
  }, [projects, searchQuery]);

  const showNotification = (message, type = "success") => {
    // Trilling toevoegen aan notificaties. Fout = zwaar, Succes = licht
    if(type === 'error') triggerVibration([100, 50, 100]);
    else triggerVibration([50]);
    
    setNotification({ message, type }); setTimeout(() => setNotification(null), 5000);
  };

  useEffect(() => {
    let isMounted = true;
    let localStream = null;

    if (isCameraOpen) {
      navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      }).then(stream => {
        if (!isMounted) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        localStream = stream;
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", true);
          videoRef.current.play().catch(e => console.log("Video play vereist interactie", e));
        }
      }).catch(err => {
        showNotification("Geen toegang tot camera. Controleer browser instellingen.", "error");
        closeOverlay(); 
      });
    }

    return () => {
      isMounted = false;
      if (isRecording && mediaRecorderRef.current) {
         mediaRecorderRef.current.stop();
      }
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      } else if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  }, [isCameraOpen]);

  const takeFastPhoto = () => {
    if (!videoRef.current || !activeProject || isRecording) return;
    
    triggerVibration(50); // Foto 'klik' voelbaar
    
    videoRef.current.style.opacity = 0.5;
    setTimeout(() => { videoRef.current.style.opacity = 1; }, 100);

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const base64Url = canvas.toDataURL("image/jpeg", 1.0);

    compressImage(base64Url, 2400, 0.95).then(async (compressedBase64) => {
      const newPhoto = { id: Date.now().toString() + Math.random(), url: compressedBase64, timestamp: new Date().toLocaleString("nl-BE"), name: `SnelFoto-${Date.now().toString().slice(-4)}.jpg`, syncStatus: isOnline ? "synced" : "pending" };
      setProjects(prevProjects => {
        const updated = prevProjects.map((p) => String(p.id) === String(activeProject.id) ? { ...p, photos: [newPhoto, ...p.photos] } : p);
        saveToDB(updated); return updated;
      });
      showNotification("📸 Foto opgeslagen!", "success");
    });
  };

  const startRecording = () => {
    if (!streamRef.current || !activeProject) return;

    triggerVibration([50, 50]); // Twee snelle tikjes voor starten video

    let mimeType = 'video/webm';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/mp4'; 
    }

    try {
      const mediaRecorder = new MediaRecorder(streamRef.current, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      const chunks = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          const base64Url = reader.result;
          const newVideo = { 
              id: Date.now().toString() + Math.random(), 
              url: base64Url, 
              timestamp: new Date().toLocaleString("nl-BE"), 
              name: `Video-${Date.now().toString().slice(-4)}.mp4`, 
              syncStatus: isOnline ? "synced" : "pending" 
          };
          setProjects(prevProjects => {
            const updated = prevProjects.map((p) => String(p.id) === String(activeProject.id) ? { ...p, photos: [newVideo, ...p.photos] } : p);
            saveToDB(updated); return updated;
          });
          showNotification("🎥 Video opgeslagen!", "success");
        };
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      showNotification("Video opnemen wordt niet ondersteund op dit toestel.", "error");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      triggerVibration([100]); // Iets langere tik bij stoppen
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleMultipleUpload = async (event) => {
    const files = Array.from(event.target.files);
    if (!files.length || !activeProject) return;

    showNotification(`Bezig met verwerken van ${files.length} bestand(en)...`, "success");
    let newPhotos = [];
    for (let file of files) {
      const reader = new FileReader();
      const base64Url = await new Promise((resolve) => {
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
      
      if (file.type.startsWith("image/")) {
          const compressedBase64 = await compressImage(base64Url, 2400, 0.95);
          newPhotos.push({ id: Date.now().toString() + Math.random(), url: compressedBase64, timestamp: new Date().toLocaleString("nl-BE"), name: file.name, syncStatus: isOnline ? "synced" : "pending" });
      } else {
          newPhotos.push({ id: Date.now().toString() + Math.random(), url: base64Url, timestamp: new Date().toLocaleString("nl-BE"), name: file.name, syncStatus: isOnline ? "synced" : "pending" });
      }
    }

    const updated = projectsRef.current.map((p) => String(p.id) === String(activeProject.id) ? { ...p, photos: [...newPhotos, ...p.photos] } : p);
    await saveToDB(updated); setProjects(updated);
    event.target.value = null; showNotification("✅ Upload voltooid!", "success");
  };

  const toggleListening = () => {
    triggerVibration();
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { showNotification("Spraakherkenning wordt niet ondersteund.", "error"); return; }
    if (isListening) { setIsListening(false); return; }

    const recognition = new SpeechRecognition(); recognition.lang = 'nl-BE'; recognition.interimResults = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = async (event) => {
      const transcript = event.results[0][0].transcript;
      const currentNotes = activeProject.notes ? activeProject.notes + "\n" : "";
      const updated = projectsRef.current.map((p) => String(p.id) === String(activeProject.id) ? { ...p, notes: currentNotes + "- " + transcript } : p);
      await saveToDB(updated); setProjects(updated); showNotification("🎙️ Notitie toegevoegd!", "success");
    };
    recognition.onerror = (e) => { setIsListening(false); if(e.error === 'not-allowed') showNotification("Microfoon toegang geweigerd.", "error"); };
    recognition.onend = () => setIsListening(false);
    try { recognition.start(); } catch (err) { setIsListening(false); showNotification("Starten mislukt.", "error"); }
  };

  // --- NIEUW: AUTO-SAVE LOGICA VOOR NOTITIES ---
  const handleNotesChange = (e) => {
    const val = e.target.value;
    
    // Direct de UI updaten zodat typen vloeiend blijft
    setProjects((prev) => prev.map((p) => String(p.id) === String(activeProject.id) ? { ...p, notes: val } : p));
    
    // Wis eventuele oude timers
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    
    // Zet een nieuwe timer: 1 seconde na de LAATSTE toetsaanslag, slaat hij op in de DB
    saveTimeoutRef.current = setTimeout(() => {
        saveToDB(projectsRef.current);
    }, 1000);
  };

  const handleUpdateStatus = async (newStatus) => {
    if (!activeProject) return;
    triggerVibration();
    const signature = (newStatus === "Afgewerkt" || newStatus === "Service nodig") ? activeProject.signature : null;
    const updated = projectsRef.current.map((p) => String(p.id) === String(activeProject.id) ? { ...p, status: newStatus, signature } : p);
    await saveToDB(updated); setProjects(updated); 
    
    showNotification(`Status gewijzigd naar: ${newStatus}`, newStatus === "Service nodig" ? "error" : "success");
  };

  const handleSaveSignature = async (base64Data) => {
    if (!activeProject) return;
    const updated = projectsRef.current.map((p) => String(p.id) === String(activeProject.id) ? { ...p, signature: base64Data } : p);
    await saveToDB(updated); setProjects(updated); if (base64Data) showNotification("✍️ Handtekening bevestigd!", "success");
  };

  const handleUpdateWorkHours = async (hours) => {
    if (!activeProject) return;
    const updated = projectsRef.current.map((p) => String(p.id) === String(activeProject.id) ? { ...p, workHours: hours } : p);
    await saveToDB(updated); setProjects(updated);
  };

  const handleDeletePhoto = async (photoId) => {
    if (!window.confirm("Weet je zeker dat je dit wilt verwijderen?")) return;
    const updated = projectsRef.current.map((p) => String(p.id) === String(activeProject.id) ? { ...p, photos: p.photos.filter((photo) => photo.id !== photoId) } : p);
    await saveToDB(updated); setProjects(updated); showNotification("🗑️ Bestand verwijderd.", "success");
    // Zorg dat de lightbox ook sluit als we iets deleten terwijl het open is
    if (fullScreenMedia && fullScreenMedia.id === photoId) closeOverlay();
  };

  const handleConfirmDeleteProject = async () => {
    if (!projectToDelete) return;
    const updated = projects.filter((p) => String(p.id) !== String(projectToDelete.id));
    await saveToDB(updated);
    setProjects(updated);
    setProjectToDelete(null);
    window.location.replace("#"); 
    showNotification("🗑️ Dossier definitief verwijderd.", "success");
  };

  const handleAddProject = async (e) => {
    e.preventDefault();
    if (!newProjectData.name || !newProjectData.date || !newProjectData.id) {
        return showNotification("Vul alle verplichte velden in.", "error");
    }
    const newProject = { 
        id: newProjectData.id, 
        name: newProjectData.name, 
        date: newProjectData.date, 
        duration: newProjectData.duration, 
        status: getDerivedStatus("Gepland", newProjectData.date), 
        photos: [], notes: "", workHours: "", signature: null 
    };
    const updated = [...projectsRef.current, newProject].sort((a, b) => new Date(a.date) - new Date(b.date));
    await saveToDB(updated); 
    setProjects(updated);
    setNewProjectData({ name: "", id: "", date: "", duration: "1 dag" });
    closeOverlay(); 
    showNotification("✨ Projectmap aangemaakt!", "success");
  };

  const handleMagicUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setIsMagicLoading(true);
    showNotification(`🕵️‍♂️ Scanner analyseert document...`, "success");
    
    try {
      const base64Url = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      if (!base64Url || !base64Url.includes(",")) throw new Error("Bestand is onleesbaar.");
      let finalBase64Data = ""; let finalMimeType = file.type || "application/pdf"; 

      if (finalMimeType.includes('pdf')) { finalBase64Data = base64Url.split(",")[1]; } 
      else if (finalMimeType.includes('image')) { const compressedImage = await compressImage(base64Url, 1600, 0.7); finalBase64Data = compressedImage.split(",")[1]; } 
      else { throw new Error("Ongeldig bestandstype. Upload een foto of PDF."); }
      
      const prompt = `Lees deze projectplanning heel goed af. Extraheer alle projecten. 1. "id": Dossiernummer (vaak 4-cijferig getal of tekst). 2. "name": Klantnaam (alleen de achternaam). 3. "date": Startdatum in formaat "YYYY-MM-DD". 4. "duration": Duur (bijv. "1 dag" of "2 dagen"). Geef UITSLUITEND een valide JSON array terug. Voorbeeld: [{"id": "1234", "name": "Voorbeeld", "date": "2026-01-01", "duration": "1 dag"}]`;
      
      let aiText = await executeAI(prompt, finalMimeType, finalBase64Data, true);
      let extractedData = []; let parsedRaw = null;
      
      try { 
        let cleanText = aiText.replace(/```json/gi, "").replace(/```/gi, "").trim();
        const jsonMatch = cleanText.match(/\[[\s\S]*\]/);
        if (jsonMatch) parsedRaw = JSON.parse(jsonMatch[0]); else parsedRaw = JSON.parse(cleanText);
      } catch (err) { throw new Error("AI kon de gegevens niet formatteren. Zorg voor een scherpe scan."); }
      
      if (Array.isArray(parsedRaw)) { extractedData = parsedRaw; } 
      else if (parsedRaw && typeof parsedRaw === 'object') {
        const foundArray = Object.values(parsedRaw).find(v => Array.isArray(v));
        if (foundArray) extractedData = foundArray; else extractedData = [parsedRaw]; 
      }

      if (!Array.isArray(extractedData) || extractedData.length === 0) throw new Error("Geen projecten gevonden in dit document.");
      const isHallucination = extractedData.some(p => !p.name || p.name.includes("Je bent") || p.name.includes("Voorbeeld") || p.name.length > 40);
      if (isHallucination) throw new Error("Document was onleesbaar voor de AI. Probeer een betere foto.");

      const newProjects = extractedData.map((proj) => ({ 
          id: String(proj.id) || `PRJ-${Math.floor(Math.random() * 10000)}`, name: proj.name || "Onbekende Klant", 
          date: proj.date || new Date().toISOString().split("T")[0], duration: proj.duration || "1 dag", 
          status: getDerivedStatus("Gepland", proj.date || new Date().toISOString().split("T")[0]), 
          photos: [], notes: "", workHours: "", signature: null 
      }));
      
      const combined = [...newProjects, ...projectsRef.current.filter((p) => !newProjects.some((np) => String(np.id) === String(p.id)))].sort((a, b) => new Date(a.date) - new Date(b.date));
      await saveToDB(combined); setProjects(combined);
      showNotification(`✨ Succes: ${newProjects.length} projecten toegevoegd!`, "success");

    } catch (error) { showNotification(`AI Fout: ${error.message}`, "error"); } 
    finally { setIsMagicLoading(false); event.target.value = null; }
  };

  const handleGenerateReport = async (type) => {
    triggerVibration();
    const title = type === "email" ? "Oplever E-mail (Service)" : "Interne Actielijst (Snag List)";
    const promptText = type === "email" 
      ? `Schrijf een korte, professionele e-mail naar de klant (${activeProject.name}). De plaatser is klaar, maar er zijn nog servicepunten. Benoem GEEN specifieke punten. Zeg dat kantoor contact opneemt. In het Nederlands.` 
      : `Maak een beknopte actielijst voor binnendienst o.b.v. dit logboek: ${activeProject.notes || "Geen"}. Nederlands.`;
    
    setReportStatus("loading"); setReportConfig({ isOpen: true, type, title });
    window.location.hash = `project/${activeProject.id}/${type}`; 
    
    try {
      const text = await executeAI(promptText);
      setGeneratedReport(text); setReportStatus("success");
    } catch (error) { 
      setReportConfig({ ...reportConfig, isOpen: false }); closeOverlay(); showNotification(`AI Fout: ${error.message}`, "error");
    }
  };

  const handleAnalyzePhoto = async (photoId, base64Url) => {
    triggerVibration();
    setAnalyzingPhotos((prev) => ({ ...prev, [photoId]: true }));
    try {
      const mimeType = "image/jpeg"; const base64Data = base64Url.split(",")[1];
      const prompt = "Analyseer deze foto van een keukeninstallatie kort. Beschrijf zichtbare gebreken of gereedschap. In het Nederlands.";
      const text = await executeAI(prompt, mimeType, base64Data);
      const updated = projectsRef.current.map((p) => String(p.id) === String(activeProject.id) ? { ...p, photos: p.photos.map((photo) => photo.id === photoId ? { ...photo, aiCaption: text } : photo) } : p);
      await saveToDB(updated); setProjects(updated); showNotification("✨ Foto geanalyseerd door AI.", "success");
    } catch (error) { showNotification(`AI Fout: ${error.message}`, "error"); } 
    finally { setAnalyzingPhotos((prev) => ({ ...prev, [photoId]: false })); }
  };

  const handleChatImageUpload = async (event) => { 
    const file = event.target.files[0]; 
    if (file) { 
      const reader = new FileReader(); 
      reader.onloadend = async () => { const compressedBase64 = await compressImage(reader.result, 1000, 0.7); setChatImage(compressedBase64); };
      reader.readAsDataURL(file); 
    } 
    event.target.value = null; 
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() && !chatImage) return;
    const userText = chatInput.trim() || "Wat zie je op deze foto?";
    const currentImage = chatImage;
    setChatMessages((prev) => [...prev, { role: "user", text: userText, image: currentImage }]);
    setChatInput(""); setChatImage(null); setIsChatLoading(true);
    try {
      const prompt = `Je bent expert keukenmonteur. Geef kort, praktisch advies op de vraag: "${userText}"`;
      let text = await executeAI(prompt, currentImage ? "image/jpeg" : null, currentImage ? currentImage.split(",")[1] : null);
      setChatMessages((prev) => [...prev, { role: "assistant", text }]);
    } catch (error) { setChatMessages((prev) => [...prev, { role: "assistant", text: `❌ Fout: ${error.message}` }]); } 
    finally { setIsChatLoading(false); }
  };

  const handleTranslateReport = async (language) => {
    if (!generatedReport) return;
    setIsTranslating(true);
    try {
      const prompt = `Vertaal deze tekst naar het ${language}:\n"${generatedReport}"`;
      const text = await executeAI(prompt);
      setGeneratedReport(text); showNotification(`✨ Vertaald naar ${language}!`, "success");
    } catch (error) { showNotification(`Vertaalfout: ${error.message}`, "error"); } 
    finally { setIsTranslating(false); }
  };

  const handleStructureNote = async () => {
    if (!activeProject?.notes.trim()) return;
    setIsNoteLoading(true);
    try {
      const prompt = `Analyseer deze ruwe werfnotities: "${activeProject.notes}". Maak een overzicht met: 🛠️ WAT ER NOG MOET GEBEUREN en 📦 WAT ER ONTBREEKT. Bullet points, zakelijk Nederlands.`;
      const text = await executeAI(prompt);
      const updated = projectsRef.current.map((p) => String(p.id) === String(activeProject.id) ? { ...p, notes: text } : p);
      await saveToDB(updated); setProjects(updated); showNotification("✨ Service punten overzichtelijk gemaakt!", "success");
    } catch (error) { showNotification(`AI Fout: ${error.message}`, "error"); } 
    finally { setIsNoteLoading(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-24 relative print:bg-white print:pb-0">
      <header className="bg-slate-900 text-white sticky top-0 z-40 shadow-lg px-4 h-16 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-2 cursor-pointer group" onClick={() => magicUploadRef.current?.click()}>
          <div className="bg-blue-600 p-2 rounded-lg group-hover:bg-blue-500 transition-colors">
            {isMagicLoading ? <Loader2 className="animate-spin" size={20} /> : <FolderOpen size={20} />}
          </div>
          <h1 className="font-bold text-lg sm:text-xl tracking-tight">Goossens<span className="text-blue-400">Docs</span></h1>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${isOnline ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/20 text-red-500"}`}>
            {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
            <span className="hidden sm:inline">{isOnline ? "ONLINE" : "OFFLINE"}</span>
          </div>

          <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center font-bold text-blue-400 border border-slate-600">G</div>
        </div>
        <input type="file" ref={magicUploadRef} className="hidden" accept="image/*,application/pdf" onChange={handleMagicUpload} />
      </header>

      <main className="max-w-6xl mx-auto p-4 sm:p-6 print:p-0">
        {activeView === "list" ? (
          <div className="w-full animate-in fade-in duration-300 print:hidden">
            <div className="mb-6 md:mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Projecten</h2>
                <p className="text-slate-500 text-sm">Beheer de keukeninstallaties van Goossens.</p>
              </div>
              <button onClick={() => window.location.hash = "new-project"} className="flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl font-bold shadow-md hover:bg-blue-700 transition-all active:scale-95">
                <Plus size={20} /> Nieuw Project
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input type="text" placeholder="Zoek op naam of dossier..." className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-2xl shadow-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all text-lg" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <div className="grid gap-4 mt-6">
              {filteredProjects.length > 0 ? filteredProjects.map((p) => (
                <div key={p.id} onClick={() => handleProjectClick(p.id)} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 cursor-pointer transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="space-y-1 flex-1">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                      <h3 className="font-bold text-lg sm:text-xl text-slate-800">{p.name}</h3>
                      <span className={`text-[10px] uppercase tracking-widest px-2.5 py-0.5 rounded-full font-bold whitespace-nowrap ${p.status === "In uitvoering" ? "bg-blue-100 text-blue-700" : p.status === "Afgewerkt" ? "bg-emerald-100 text-emerald-700" : p.status === "Service nodig" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}>{p.status}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-slate-500 mt-2 sm:mt-3">
                      <span className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md"><Calendar size={14} />{p.date.split("-").reverse().join("-")}<span className="text-indigo-300">|</span> {p.duration}</span>
                      <span className="flex items-center gap-1.5 text-xs sm:text-sm bg-slate-50 px-2 py-1 rounded-md border border-slate-100"><FolderOpen size={14} /> {p.id}</span>
                    </div>
                  </div>
                  <div className="bg-blue-50 px-4 py-2 sm:py-3 rounded-lg text-blue-600 font-bold flex items-center justify-center gap-2 text-sm sm:text-base w-full sm:w-auto shrink-0">
                    <ImageIcon size={18} /> {p.photos?.length || 0} media
                  </div>
                </div>
              )) : (
                <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200">
                  <p className="text-slate-400 font-medium text-sm italic">Geen projecten gevonden. Voeg er een toe of scan de planning via de map linksboven.</p>
                </div>
              )}
            </div>
          </div>
        ) : activeProject ? (
          <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
            <div className="flex justify-between items-center print:hidden">
              <button onClick={handleBackToList} className="flex items-center gap-2 text-slate-700 font-bold text-lg hover:text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-xl transition-all shadow-sm border border-slate-200 bg-white">
                <ChevronLeft size={24} /> Terug
              </button>
              <button onClick={handlePrintPDF} className="flex items-center gap-2 bg-slate-800 text-white font-bold text-sm hover:bg-slate-700 px-4 py-2 rounded-xl transition-all shadow-md">
                <Printer size={18} /> Opslaan als PDF
              </button>
            </div>
            
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6 print:border-none print:shadow-none print:p-0">
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                <div className="flex flex-col gap-1 w-full">
                  <div className="flex items-center gap-3">
                    <h2 className="text-3xl font-black text-slate-800">{activeProject.name}</h2>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap ${activeProject.status === "In uitvoering" ? "bg-blue-100 text-blue-700" : activeProject.status === "Afgewerkt" ? "bg-emerald-100 text-emerald-700" : activeProject.status === "Service nodig" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}>{activeProject.status}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-slate-500 mt-2 font-bold">
                    <span className="flex items-center gap-1.5 cursor-pointer hover:text-rose-500 transition-colors bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 shadow-sm print:border-none print:bg-transparent print:p-0" onDoubleClick={() => { triggerVibration(); window.location.hash = `project/${activeProject.id}/delete`; }} title="Dubbelklik om map te verwijderen"><FolderOpen size={16} /> {activeProject.id}</span>
                    <span className="flex items-center gap-1.5 text-indigo-700 font-bold bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 shadow-sm print:border-none print:bg-transparent print:p-0"><Calendar size={16} /> {activeProject.date.split("-").reverse().join("-")} <span className="text-indigo-300 mx-0.5">|</span> <Clock size={16} /> {activeProject.duration}</span>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 print:hidden">
                <button onClick={() => { triggerVibration(); window.location.hash = `project/${activeProject.id}/camera`; }} className="flex flex-col items-center justify-center p-6 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-all shadow-md active:scale-95 group"><Camera size={32} className="mb-2 group-hover:scale-110 transition-transform" /><span className="font-bold text-sm sm:text-base uppercase tracking-widest text-center">Foto / Video (Snel)</span></button>
                <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center justify-center p-6 bg-white border-2 border-slate-200 text-slate-600 rounded-2xl hover:border-blue-300 hover:bg-blue-50 transition-all active:scale-95 group"><Upload size={32} className="mb-2 group-hover:scale-110 transition-transform text-slate-400" /><span className="font-bold text-sm sm:text-base uppercase tracking-widest text-center">Uploaden (Meerdere)</span></button>
              </div>

              <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-sm print:border-none print:shadow-none print:p-0">
                <h3 className="text-lg sm:text-xl font-black text-slate-800 mb-2 flex items-center gap-2 print:hidden"><CheckCircle size={22} className="text-slate-400 shrink-0" /> Status Oplevering</h3>
                <div className="flex flex-col sm:flex-row gap-3 mb-6 print:hidden">
                  <button onClick={() => handleUpdateStatus("Afgewerkt")} className={`flex-1 flex items-center justify-center gap-2 py-3 sm:py-4 px-2 rounded-xl border-2 font-bold transition-all text-sm sm:text-base ${activeProject.status === "Afgewerkt" ? "bg-emerald-50 border-emerald-500 text-emerald-700 shadow-sm" : "bg-white border-slate-200 text-slate-600 hover:border-emerald-300 hover:bg-emerald-50"}`}><CheckCircle size={20} className="shrink-0" /><span>Afgewerkt <span className="hidden sm:inline">(Geen Service)</span></span></button>
                  <button onClick={() => handleUpdateStatus("Service nodig")} className={`flex-1 flex items-center justify-center gap-2 py-3 sm:py-4 px-2 rounded-xl border-2 font-bold transition-all text-sm sm:text-base ${activeProject.status === "Service nodig" ? "bg-rose-50 border-rose-500 text-rose-700 shadow-sm" : "bg-white border-slate-200 text-slate-600 hover:border-rose-300 hover:bg-rose-50"}`}><AlertTriangle size={20} className="shrink-0" /><span>Service Nodig</span></button>
                </div>

                {activeProject.status === "Service nodig" && (
                  <div className="mb-6 p-5 bg-red-100 rounded-2xl border-2 border-red-500 shadow-md animate-in fade-in print:bg-transparent print:border-none print:p-0">
                    <label className="block text-sm font-bold text-red-900 mb-2 flex items-center gap-2"><Clock size={16} /> Geschatte Resterende Werkuren (Service)</label>
                    <select className="w-full p-3 bg-white border-2 border-red-300 rounded-xl focus:ring-2 focus:ring-red-500 outline-none text-sm text-slate-700 appearance-none font-bold shadow-sm print:hidden" value={activeProject.workHours || ""} onChange={(e) => handleUpdateWorkHours(e.target.value)}>
                      <option value="" disabled>Selecteer aantal uren...</option>
                      {[0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8].map((h) => (
                        <option key={h} value={`${h} uur`}>{h} uur</option>
                      ))}
                    </select>
                    <p className="hidden print:block text-lg font-bold text-red-700">{activeProject.workHours || "Geen uren opgegeven"}</p>
                  </div>
                )}

                {/* HANDTEKENING */}
                {(activeProject.status === "Afgewerkt" || activeProject.status === "Service nodig") && (
                  <div className="mb-6 p-5 bg-slate-50 rounded-2xl border border-slate-200 animate-in fade-in print:bg-transparent print:border-none print:p-0">
                    <label className="block text-sm font-bold text-slate-800 mb-3 flex items-center gap-2"><PenTool size={16} className="text-slate-500" /> Handtekening Klant voor Akkoord</label>
                    
                    {!activeProject.signature ? (
                      <SignaturePad onSave={handleSaveSignature} onClear={() => handleSaveSignature(null)} initialSignature={activeProject.signature} />
                    ) : (
                      <div className="space-y-3">
                        <img src={activeProject.signature} alt="Handtekening Klant" className="h-32 border-b-2 border-slate-800 print:border-black" />
                        <p className="text-xs text-emerald-600 font-bold flex items-center gap-1 print:hidden"><CheckCircle size={14} /> Digitaal getekend</p>
                        <button onClick={() => handleSaveSignature(null)} className="text-xs font-bold text-slate-500 hover:text-rose-600 transition-colors print:hidden flex items-center gap-1">
                          <Eraser size={12} /> Handtekening wissen en opnieuw tekenen
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-6 border-t border-slate-100 space-y-3 print:pt-4">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-sm font-black text-slate-800 flex items-center gap-2"><FileText size={18} className="text-slate-400" /> Project Logboek en Service Punten</p>
                    <button onClick={toggleListening} className={`print:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${isListening ? 'bg-rose-100 text-rose-600 animate-pulse' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                      <Mic size={14} /> {isListening ? "Aan het luisteren..." : "Dicteren"}
                    </button>
                  </div>
                  
                  {/* --- AANGEPAST: AUTO-SAVE OP HET TEKSTVAK --- */}
                  <textarea className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none min-h-[180px] text-sm font-medium leading-relaxed print:hidden" placeholder="Typ of dicteer hier de werfnotities of servicepunten..." value={activeProject.notes} onChange={handleNotesChange} />
                  
                  <div className="hidden print:block text-sm text-slate-700 whitespace-pre-wrap leading-relaxed border border-slate-200 p-4 rounded-xl">
                    {activeProject.notes || "Geen notities of service punten opgegeven."}
                  </div>

                  <button onClick={handleStructureNote} disabled={isNoteLoading} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-50 text-indigo-700 border border-indigo-200 px-5 py-3 rounded-xl font-bold text-sm shadow-sm hover:bg-indigo-100 disabled:opacity-50 print:hidden">{isNoteLoading ? <Loader2 className="animate-spin" size={16} /> : <ListChecks size={16} />} Automatisch Punten Maken (AI)</button>
                </div>
              </div>

              {/* AI ACTIES */}
              <div className="bg-indigo-50/50 p-5 sm:p-6 rounded-3xl border border-indigo-100 print:hidden">
                <h3 className="text-sm sm:text-base font-black text-indigo-800 uppercase tracking-wider mb-4 flex items-center gap-2"><Sparkles size={18} /> Slimme AI Acties</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button onClick={() => { triggerVibration(); window.location.hash = `project/${activeProject.id}/email`; }} className="bg-white p-4 sm:p-5 rounded-2xl border border-indigo-100 flex flex-col items-center justify-center gap-2 hover:bg-indigo-50 hover:border-indigo-300 transition-all shadow-sm active:scale-95 text-center"><span className="text-indigo-500"><FileText size={24} /></span><span className="text-xs sm:text-sm font-bold text-indigo-800">E-mail Klant (Service)</span></button>
                  <button onClick={() => { triggerVibration(); window.location.hash = `project/${activeProject.id}/snaglist`; }} className="bg-white p-4 sm:p-5 rounded-2xl border border-indigo-100 flex flex-col items-center justify-center gap-2 hover:bg-indigo-50 hover:border-indigo-300 transition-all shadow-sm active:scale-95 text-center"><span className="text-indigo-500"><ListChecks size={24} /></span><span className="text-xs sm:text-sm font-bold text-indigo-800">Genereer Actielijst</span></button>
                </div>
              </div>

              {/* MEDIA WEERGAVE (FOTO EN VIDEO) */}
              <div className="space-y-4 print:hidden">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Media Documentatie ({activeProject.photos.length})</p>
                {activeProject.photos.length === 0 ? <div className="py-12 border-2 border-dashed border-slate-200 rounded-3xl text-center text-slate-400 font-bold italic text-sm">Geen media in deze map.</div> : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {activeProject.photos.map((ph) => (
                      <div key={ph.id} className="bg-slate-50 rounded-2xl overflow-hidden border border-slate-200 flex flex-col shadow-sm">
                        
                        {/* --- AANGEPAST: KLIKKEN OP FOTO VOOR LIGHTBOX --- */}
                        <div className="relative aspect-video bg-black flex items-center justify-center cursor-pointer group" onClick={() => window.location.hash = `project/${activeProject.id}/media/${ph.id}`}>
                          {ph.url.startsWith("data:video") || ph.name?.endsWith(".mp4") || ph.name?.endsWith(".webm") ? (
                             <video src={ph.url} className="w-full h-full object-contain" />
                          ) : (
                             <img src={ph.url} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" alt="Werf media" />
                          )}
                          
                          {/* Hover Overlay Icon */}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center pointer-events-none">
                              <Maximize2 className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md" size={32} />
                          </div>

                          <button onClick={(e) => { e.stopPropagation(); handleDeletePhoto(ph.id); }} className="absolute top-2 left-2 bg-rose-500/90 text-white p-2 rounded-xl shadow-lg hover:bg-rose-600 transition-colors backdrop-blur-sm z-10" title="Verwijder media"><Trash2 size={16} /></button>
                        </div>

                        <div className="p-4 space-y-3">
                          {ph.aiCaption ? <div className="bg-purple-50 p-3 rounded-xl text-xs text-purple-700 font-medium leading-relaxed border border-purple-100 flex gap-2"><Sparkles size={12} className="shrink-0 text-purple-400" /> {ph.aiCaption}</div> : (
                            <button onClick={() => handleAnalyzePhoto(ph.id, ph.url)} disabled={analyzingPhotos[ph.id] || ph.url.startsWith("data:video")} className="w-full py-2 rounded-lg bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 disabled:opacity-50 transition-colors">{analyzingPhotos[ph.id] ? <Loader2 className="animate-spin inline mr-2" size={12} /> : <Sparkles size={12} className="inline mr-2" />} {ph.url.startsWith("data:video") ? "Video Analyse Niet Ondersteund" : "Analyseer Foto (AI)"}</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="py-32 text-center space-y-4 animate-in fade-in print:hidden">
             <Loader2 className="animate-spin mx-auto text-slate-400" size={40} />
             <p className="text-slate-500 font-medium">Map laden...</p>
             <button onClick={closeOverlay} className="mt-4 px-6 py-2 bg-slate-200 text-slate-700 rounded-full font-bold text-sm hover:bg-slate-300 transition-colors shadow-sm">Terug naar overzicht</button>
          </div>
        )}
      </main>

      {/* --- ADD PROJECT MODAL --- */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4 animate-in fade-in duration-200 print:hidden">
          <div className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl flex flex-col">
            <div className="p-6 bg-slate-50 border-b flex justify-between items-center">
              <h3 className="font-black uppercase tracking-widest text-lg sm:text-xl flex items-center gap-2"><Plus size={20}/> Nieuw Project</h3>
              <button type="button" onClick={closeOverlay} className="hover:bg-slate-200 p-1 rounded-full transition-colors"><X size={24} /></button>
            </div>
            <form onSubmit={handleAddProject} className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Klantnaam *</label>
                <input type="text" required placeholder="Bijv. Peeters" className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 text-slate-700 font-medium transition-all" value={newProjectData.name} onChange={(e) => setNewProjectData({...newProjectData, name: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Dossiernummer *</label>
                <input type="text" required placeholder="Bijv. 1234" className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 text-slate-700 font-medium transition-all" value={newProjectData.id} onChange={(e) => setNewProjectData({...newProjectData, id: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Startdatum *</label>
                <input type="date" required className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 text-slate-700 font-bold transition-all" value={newProjectData.date} onChange={(e) => setNewProjectData({...newProjectData, date: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Duur *</label>
                <div className="relative">
                  <select className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 text-slate-700 font-bold transition-all appearance-none" value={newProjectData.duration} onChange={(e) => setNewProjectData({...newProjectData, duration: e.target.value})}>
                    <option value="1 dag">1 dag</option>
                    <option value="2 dagen">2 dagen</option>
                    <option value="3 dagen">3 dagen</option>
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">▼</div>
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={closeOverlay} className="flex-1 py-4 font-bold text-slate-500 text-sm bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">Annuleren</button>
                <button type="submit" className="flex-1 py-4 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-lg hover:bg-blue-700 transition-colors">Aanmaken</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- DE HERSTELDE DELETE MODAL --- */}
      {projectToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4 animate-in fade-in duration-200 print:hidden">
          <div className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl flex flex-col">
            <div className="p-6 bg-slate-50 border-b flex justify-between items-center">
              <h3 className="font-black uppercase tracking-widest text-[10px] flex items-center gap-2 text-rose-600"><AlertTriangle size={14}/> Dossier Verwijderen</h3>
              <button type="button" onClick={closeOverlay}><X size={20} /></button>
            </div>
            <div className="p-8 text-center space-y-4">
              <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 size={32} />
              </div>
              <p className="text-slate-800 font-bold text-lg">Weet je zeker dat je het dossier van {projectToDelete.name} wilt verwijderen?</p>
              <p className="text-slate-500 text-sm">Dit verwijdert alle foto's, notities en handtekeningen. Dit kan niet ongedaan worden gemaakt.</p>
            </div>
            <div className="p-6 bg-slate-50 flex gap-3">
              <button type="button" onClick={closeOverlay} className="flex-1 py-3 font-bold text-slate-600 bg-slate-200 hover:bg-slate-300 rounded-xl text-sm transition-colors">Annuleren</button>
              <button type="button" onClick={handleConfirmDeleteProject} className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-sm shadow-lg transition-colors">Ja, verwijderen</button>
            </div>
          </div>
        </div>
      )}

      {/* --- CAMERA VOLLEDIG SCHERM (MET FOTO EN VIDEO KNOP) --- */}
      {isCameraOpen && (
        <div className="fixed inset-0 bg-black z-[100] flex flex-col animate-in fade-in duration-200">
          <div className="flex justify-between items-center p-4 bg-black text-white shrink-0 z-10">
            <span className="font-bold tracking-widest uppercase text-sm">
               {isRecording ? <span className="text-rose-500 animate-pulse flex items-center gap-2"><Square size={12} fill="currentColor"/> OPNEMEN...</span> : "Foto / Video Camera"}
            </span>
            <button onClick={closeOverlay} className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 transition-colors"><X size={24} /></button>
          </div>
          <div className="flex-1 relative bg-black overflow-hidden">
             <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover transition-opacity duration-100"></video>
          </div>
          <div className="h-32 bg-black flex items-center justify-center gap-8 pb-8 shrink-0 z-10">
             <button onClick={takeFastPhoto} disabled={isRecording} className={`w-20 h-20 bg-white rounded-full border-4 border-slate-300 active:bg-slate-300 active:scale-95 transition-all shadow-lg flex items-center justify-center ${isRecording ? 'opacity-50' : ''}`}>
                <Camera size={32} className="text-slate-800" />
             </button>
             
             {!isRecording ? (
                 <button onClick={startRecording} className="w-20 h-20 bg-white rounded-full border-4 border-slate-300 active:bg-rose-100 active:scale-95 transition-all shadow-lg flex items-center justify-center">
                    <Video size={32} className="text-rose-600" />
                 </button>
             ) : (
                 <button onClick={stopRecording} className="w-20 h-20 bg-rose-600 rounded-full border-4 border-rose-300 animate-pulse transition-all shadow-lg flex items-center justify-center">
                    <Square size={28} className="text-white" fill="currentColor" />
                 </button>
             )}
          </div>
        </div>
      )}

      {/* --- NIEUW: LIGHTBOX VOOR FULLSCREEN MEDIA --- */}
      {fullScreenMedia && (
        <div className="fixed inset-0 bg-black z-[120] flex flex-col animate-in fade-in duration-200">
          <div className="flex justify-between items-center p-4 bg-gradient-to-b from-black/80 to-transparent text-white absolute top-0 w-full z-10">
            <div className="text-xs font-bold opacity-80">{fullScreenMedia.timestamp}</div>
            <div className="flex gap-2">
                <button onClick={() => handleDeletePhoto(fullScreenMedia.id)} className="p-2 bg-black/50 rounded-full hover:bg-rose-600 transition-colors"><Trash2 size={20} /></button>
                <button onClick={closeOverlay} className="p-2 bg-black/50 rounded-full hover:bg-white/20 transition-colors"><X size={20} /></button>
            </div>
          </div>
          <div className="flex-1 w-full h-full flex items-center justify-center overflow-hidden" onClick={closeOverlay}>
            {fullScreenMedia.url.startsWith("data:video") || fullScreenMedia.name?.endsWith(".mp4") || fullScreenMedia.name?.endsWith(".webm") ? (
               <video src={fullScreenMedia.url} controls autoPlay className="max-w-full max-h-full" onClick={(e) => e.stopPropagation()} />
            ) : (
               <img src={fullScreenMedia.url} className="max-w-full max-h-full object-contain transition-transform" alt="Vergrote Media" onClick={(e) => e.stopPropagation()} />
            )}
          </div>
          {fullScreenMedia.aiCaption && (
              <div className="absolute bottom-0 w-full p-6 bg-gradient-to-t from-black/90 via-black/70 to-transparent">
                  <div className="text-white text-sm font-medium leading-relaxed flex gap-3 items-start max-w-3xl mx-auto">
                      <Sparkles size={18} className="shrink-0 text-blue-400 mt-0.5" />
                      <p>{fullScreenMedia.aiCaption}</p>
                  </div>
              </div>
          )}
        </div>
      )}

      {/* MODAL VOOR AI RAPPORTEN EN E-MAILS */}
      {reportConfig.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4 animate-in fade-in duration-200 print:hidden">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50"><h3 className="font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 text-xs sm:text-sm"><Sparkles className="text-blue-500" size={18} /> {reportConfig.title}</h3><button onClick={closeOverlay} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={20} /></button></div>
            <div className="p-6 overflow-y-auto flex-1 bg-white">
              {reportStatus === "loading" ? <div className="py-20 text-center space-y-4"><Loader2 className="animate-spin mx-auto text-blue-600" size={40} /><p className="font-bold text-slate-400 uppercase tracking-widest text-[10px]">AI stelt document op...</p></div> : (
                <div className="space-y-4">
                  <textarea className="w-full min-h-[300px] p-4 bg-slate-50 border border-slate-200 rounded-2xl font-sans text-slate-700 text-sm leading-relaxed outline-none" value={generatedReport} onChange={(e) => setGeneratedReport(e.target.value)} />
                  <div className="flex flex-wrap gap-2 pt-2"><span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest w-full mb-1">Vertalen:</span><button onClick={() => handleTranslateReport("Frans")} disabled={isTranslating} className="bg-blue-50 text-blue-700 px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-100 disabled:opacity-50">🇫🇷 Frans</button><button onClick={() => handleTranslateReport("Engels")} disabled={isTranslating} className="bg-rose-50 text-rose-700 px-4 py-2 rounded-xl text-xs font-bold hover:bg-rose-100 disabled:opacity-50">🇬🇧 Engels</button></div>
                  <div className="flex justify-end gap-3 pt-4"><button onClick={() => { triggerVibration(); navigator.clipboard.writeText(generatedReport); showNotification("Gekopieerd naar klembord!", "success"); }} className="px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 text-xs">Kopieer</button><button onClick={closeOverlay} className="px-6 py-3 bg-slate-900 text-white rounded-xl font-bold shadow-lg text-xs">Sluiten</button></div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* AI CHAT ASSISTENT */}
      <div className="fixed bottom-0 right-0 sm:bottom-6 sm:right-6 z-[60] flex flex-col items-end pointer-events-none print:hidden">
        {isChatOpen && (
          <div className="bg-white fixed inset-0 sm:static w-full h-full sm:w-96 sm:h-[600px] sm:rounded-3xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col sm:mb-4 animate-in slide-in-from-bottom-4 pointer-events-auto z-[70]">
            <div className="bg-slate-900 p-4 flex justify-between items-center text-white shrink-0">
              <div className="flex items-center gap-2"><Sparkles className="text-blue-400" size={18} /><span className="font-bold tracking-tight">Montage Assistent</span></div>
              <button onClick={closeOverlay} className="p-2 hover:bg-slate-800 rounded-full transition-colors"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
              {chatMessages.map((m, i) => (
                <div key={i} className={`max-w-[85%] p-3 rounded-2xl text-sm font-medium ${m.role === "user" ? "bg-blue-600 text-white self-end rounded-tr-none ml-auto" : "bg-white text-slate-700 border border-slate-200 self-start rounded-tl-none shadow-sm"}`}>
                  {m.image && <img src={m.image} className="rounded-lg mb-2 border border-black/10" alt="Chat bijlage" />}
                  <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                </div>
              ))}
              {isChatLoading && <div className="bg-white border border-slate-200 p-3 rounded-2xl self-start rounded-tl-none flex items-center gap-2 text-xs font-bold text-slate-400 shadow-sm"><Loader2 className="animate-spin" size={14} /> AI denkt na...</div>}
            </div>
            {chatImage && <div className="p-2 bg-slate-200 flex gap-2 shrink-0"><div className="relative w-12 h-12"><img src={chatImage} className="w-full h-full object-cover rounded" alt="Chat preview" /><button onClick={() => { triggerVibration(); setChatImage(null); }} className="absolute -top-1 -right-1 bg-rose-500 text-white rounded-full p-0.5"><X size={10} /></button></div></div>}
            <div className="p-3 bg-white border-t border-slate-100 flex items-center gap-2 shrink-0">
              <button onClick={() => chatFileInputRef.current?.click()} className="p-2 text-slate-400 hover:text-blue-600 transition-colors shrink-0"><Paperclip size={20} /></button>
              <input type="text" className="flex-1 bg-slate-100 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Stel een technische vraag..." value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSendMessage()} />
              <button onClick={() => { triggerVibration(); handleSendMessage(); }} className="bg-blue-600 text-white p-3 rounded-xl shrink-0 shadow-md hover:bg-blue-700 transition-colors"><Send size={18} /></button>
            </div>
            <input type="file" ref={chatFileInputRef} className="hidden" accept="image/*" onChange={handleChatImageUpload} />
          </div>
        )}
        <button onClick={() => { triggerVibration(); window.location.hash = activeProject ? `project/${activeProject.id}/chat` : "chat"; }} className={`fixed sm:static bottom-6 right-6 bg-slate-900 text-white p-4 rounded-full shadow-2xl hover:scale-110 transition-all shadow-blue-500/20 pointer-events-auto print:hidden ${isChatOpen ? 'hidden sm:block' : 'block'}`}>
          <MessageSquare size={24} />
        </button>
      </div>

      <input type="file" accept="image/*" multiple ref={fileInputRef} style={{ display: 'none' }} onChange={handleMultipleUpload} />
      
      {notification && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 px-6 py-4 rounded-2xl shadow-2xl flex items-center justify-center gap-3 z-[100] animate-in fade-in slide-in-from-bottom-4 w-[90%] sm:w-auto text-white font-bold text-sm text-center print:hidden ${notification.type === "error" ? "bg-rose-600" : "bg-emerald-600"}`}>
          {notification.type === "error" ? <AlertTriangle size={20} className="shrink-0" /> : <CheckCircle size={20} className="shrink-0" />}
          <span>{notification.message}</span>
        </div>
      )}
    </div>
  );
}

export default App;
