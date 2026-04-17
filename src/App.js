import React, { useState, useRef, useEffect } from "react";
import {
  Camera,
  Search,
  FolderOpen,
  ChevronLeft,
  Upload,
  CheckCircle,
  MapPin,
  Calendar,
  Image as ImageIcon,
  Plus,
  Sparkles,
  FileText,
  Loader2,
  X,
  Wifi,
  WifiOff,
  Cloud,
  CloudOff,
  RefreshCw,
  ListChecks,
  Droplets,
  MessageSquare,
  Send,
  PenTool,
  Clock,
  Paperclip,
  Languages,
  ShieldCheck,
  AlertTriangle,
  ShoppingCart,
  ClipboardSignature,
  Share2,
  Utensils,
  Wrench,
  Palette,
  Trash2,
} from "lucide-react";

// --- INITIAL STATE ---
const initialProjects = [];

// --- INDEXEDDB SETUP (VOOR OFFLINE OPSLAG) ---
const DB_NAME = "KeukenAppDB_V4";
const STORE_NAME = "projects";

const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const saveToDB = async (data) => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(data, "all_projects");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error("Save DB Error:", e);
  }
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
  } catch (e) {
    console.error("Load DB Error:", e);
    return null;
  }
};

// --- HELPER FUNCTIE MET DE NIEUWE FOUTCATCHER ---
const fetchWithRetry = async (url, options, retries = 3) => {
  const delays = [1000, 2000, 4000];
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `HTTP Error ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise((r) => setTimeout(r, delays[i]));
    }
  }
};

function App() {
  const [projects, setProjects] = useState(initialProjects);
  const [activeView, setActiveView] = useState("list");
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [notification, setNotification] = useState(null);

  const projectsRef = useRef(projects);
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const [analyzingPhotos, setAnalyzingPhotos] = useState({});
  const [reportConfig, setReportConfig] = useState({
    isOpen: false,
    type: "",
    title: "",
  });
  const [generatedReport, setGeneratedReport] = useState("");
  const [reportStatus, setReportStatus] = useState("idle");

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([
    {
      role: "assistant",
      text: "Hoi! Ik ben de AI Montage Assistent. Heb je een technische vraag over de installatie of afwerking? Stel hem hier!",
    },
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isNoteLoading, setIsNoteLoading] = useState(false);

  const [chatImage, setChatImage] = useState(null);
  const chatFileInputRef = useRef(null);
  const [isTranslating, setIsTranslating] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newProjectData, setNewProjectData] = useState({
    name: "",
    id: "",
    date: "",
    duration: "1 dag",
  });

  const [projectToDelete, setProjectToDelete] = useState(null);
  const [isMagicLoading, setIsMagicLoading] = useState(false);
  const magicUploadRef = useRef(null);

  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);

  // --- API SLEUTEL EN STABIELE URL CONFIGURATIE ---
  const apiKey = String(process.env.REACT_APP_GEMINI_API_KEY || "").trim();
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const activeProject = projects.find((p) => p.id === selectedProjectId);

  const getDerivedStatus = (currentStatus, projectDate) => {
    if (currentStatus !== "Gepland") return currentStatus;
    const today = new Date().toISOString().split("T")[0];
    if (projectDate <= today) {
      return "In uitvoering";
    }
    return "Gepland";
  };

  useEffect(() => {
    const initData = async () => {
      const savedData = await loadFromDB();
      if (savedData && savedData.length > 0) {
        const updatedData = savedData.map((p) => ({
          ...p,
          status: getDerivedStatus(p.status, p.date),
        }));

        const sortedData = updatedData.sort(
          (a, b) => new Date(a.date) - new Date(b.date)
        );
        setProjects(sortedData);
      } else {
        setProjects([]);
      }
      setIsInitialized(true);
    };
    initData();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleNetwork);
    window.addEventListener("offline", handleNetwork);

    function handleNetwork() {
      setIsOnline(navigator.onLine);
    }

    return () => {
      window.removeEventListener("online", handleNetwork);
      window.removeEventListener("offline", handleNetwork);
    };
  }, []);

  useEffect(() => {
    if (isOnline && isInitialized) {
      const hasPendingPhotos = projectsRef.current.some((p) =>
        p.photos.some((photo) => photo.syncStatus === "pending")
      );
      if (hasPendingPhotos) {
        const syncData = async () => {
          setIsSyncing(true);
          await new Promise((resolve) => setTimeout(resolve, 2000));

          const updated = projectsRef.current.map((p) => ({
            ...p,
            photos: p.photos.map((photo) =>
              photo.syncStatus === "pending"
                ? { ...photo, syncStatus: "synced" }
                : photo
            ),
          }));

          await saveToDB(updated);
          setProjects(updated);
          setIsSyncing(false);
          showNotification(
            "☁️ Verbinding hersteld: offline foto's zijn geüpload!"
          );
        };
        syncData();
      }
    }
  }, [isOnline, isInitialized]);

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const showNotification = (message) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleUpdateStatus = async (newStatus) => {
    if (!activeProject) return;
    const updated = projectsRef.current.map((p) =>
      p.id === activeProject.id ? { ...p, status: newStatus } : p
    );
    await saveToDB(updated);
    setProjects(updated);
    showNotification(`Status gewijzigd naar: ${newStatus}`);
  };

  const handleUpdateWorkHours = async (hours) => {
    if (!activeProject) return;
    const updated = projectsRef.current.map((p) =>
      p.id === activeProject.id ? { ...p, workHours: hours } : p
    );
    await saveToDB(updated);
    setProjects(updated);
  };

  const handlePhotoCapture = async (event) => {
    const file = event.target.files[0];
    if (file && activeProject) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const newPhoto = {
          id: Date.now().toString(),
          url: reader.result,
          timestamp: new Date().toLocaleString("nl-BE"),
          name: file.name,
          syncStatus: isOnline ? "synced" : "pending",
        };

        const updated = projectsRef.current.map((p) =>
          p.id === activeProject.id
            ? { ...p, photos: [newPhoto, ...p.photos] }
            : p
        );

        await saveToDB(updated);
        setProjects(updated);

        if (isOnline) {
          showNotification("Foto direct geüpload naar de map!");
        } else {
          showNotification(
            "Foto lokaal opgeslagen. Wordt geüpload bij internetverbinding."
          );
        }
      };
      reader.readAsDataURL(file);
    }
    event.target.value = null;
  };

  const handleDeletePhoto = async (photoId) => {
    if (!window.confirm("Weet je zeker dat je deze foto wilt verwijderen?")) return;

    const updated = projectsRef.current.map((p) =>
      p.id === activeProject.id
        ? { ...p, photos: p.photos.filter((photo) => photo.id !== photoId) }
        : p
    );

    await saveToDB(updated);
    setProjects(updated);
    showNotification("🗑️ Foto succesvol verwijderd!");
  };

  const handleAddProject = async (e) => {
    e.preventDefault();

    if (!newProjectData.name || !newProjectData.date) {
      showNotification("Vul minstens een naam en startdatum in.");
      return;
    }

    const initialStatus = getDerivedStatus("Gepland", newProjectData.date);

    const newProject = {
      id: newProjectData.id || `PRJ-MAN-${Date.now().toString().slice(-4)}`,
      name: newProjectData.name,
      date: newProjectData.date,
      duration: newProjectData.duration,
      status: initialStatus,
      photos: [],
      notes: "",
      workHours: "",
    };

    const updated = [...projectsRef.current, newProject].sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );

    await saveToDB(updated);
    setProjects(updated);

    setNewProjectData({ name: "", id: "", date: "", duration: "1 dag" });
    setShowAddModal(false);
    showNotification(
      "✨ Nieuwe projectmap handmatig aangemaakt en direct opgeslagen!"
    );
  };

  const handleMagicUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!apiKey) {
      showNotification("❌ Oeps! API Sleutel ontbreekt of is leeg in Netlify.");
      return;
    }

    setIsMagicLoading(true);
    showNotification("🕵️‍♂️ Planning wordt gelezen en gesorteerd...");

    try {
      const base64Url = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const base64Data = base64Url.split(",")[1];
      const mimeType = file.type || "image/jpeg";

      const prompt = `Lees deze foto van een planning/document. Zoek naar projecten of keukens die geplaatst moeten worden.
      Let HEEL GOED op de balk of kolommen bovenaan waar vaak dagen of datums staan.
      Extraheer de volgende informatie per project: 
      - id (dossiernummer, verzin een als het ontbreekt beginnend met PRJ-)
      - name (klantnaam)
      - date (startdatum YYYY-MM-DD)
      - duration (duur, bijv '1 dag', '2 dagen')
      Retourneer de data UITSLUITEND als een ruwe JSON array, geen extra tekst.`;

      const data = await fetchWithRetry(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                { inlineData: { mimeType: mimeType, data: base64Data } },
              ],
            },
          ],
        }),
      });

      let aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
      aiText = aiText.replace(/```json/gi, "").replace(/```/gi, "").trim();
      
      let extractedData = [];
      try {
        extractedData = JSON.parse(aiText);
      } catch (parseError) {
        console.error("JSON Parsing fout:", parseError);
        const match = aiText.match(/\[[\s\S]*\]/);
        if (match) {
          try {
            extractedData = JSON.parse(match[0]);
          } catch (fallbackError) {
            console.error("Fallback JSON Parsing fout:", fallbackError);
          }
        }
      }

      if (Array.isArray(extractedData) && extractedData.length > 0) {
        const newProjects = extractedData.map((proj) => {
          const projectDate = proj.date || new Date().toISOString().split("T")[0];
          return {
            id: proj.id || `PRJ-${Math.floor(Math.random() * 10000)}`,
            name: proj.name || "Onbekende Klant",
            date: projectDate,
            duration: proj.duration || "1 dag",
            status: getDerivedStatus("Gepland", projectDate),
            photos: [],
            notes: "",
            workHours: "",
          };
        });

        const currentProjects = projectsRef.current;
        const combined = [
          ...newProjects,
          ...currentProjects.filter((p) => !newProjects.some((np) => np.id === p.id)),
        ];
        const sorted = combined.sort((a, b) => new Date(a.date) - new Date(b.date));

        await saveToDB(sorted);
        setProjects(sorted);
        showNotification(`✨ Succes: ${newProjects.length} projecten toegevoegd!`);
      } else {
        showNotification("Kon geen geldige projecten op de foto vinden.");
      }
    } catch (error) {
      console.error(error);
      showNotification(`❌ Fout: ${error.message}`);
    } finally {
      setIsMagicLoading(false);
      event.target.value = null;
    }
  };

  const handleGenerateReport = async (type) => {
    let title = "";
    let promptText = "";

    const photoContext = activeProject?.photos
      .filter((p) => p.aiCaption)
      .map((p, index) => `Foto ${index + 1}: ${p.aiCaption}`)
      .join("\n");

    let apiBody;

    if (type === "email") {
      title = "Oplever E-mail (Service)";
      promptText = `Schrijf een professionele e-mail naar de klant (${activeProject.name}). Informeer ze over openstaande servicepunten en verzeker ze van snelle afhandeling. Formatteer in het Nederlands.`;
      apiBody = { contents: [{ parts: [{ text: promptText }] }] };
    } else if (type === "snaglist") {
      title = "Interne Actielijst (Snag List)";
      promptText = `Maak een beknopte, puntsgewijze actielijst voor binnendienst. Notities: ${activeProject.notes || "Geen"}. Foto analyses: ${photoContext || "Geen"}. Antwoord in Nederlands.`;
      apiBody = { contents: [{ parts: [{ text: promptText }] }] };
    }

    setReportStatus("loading");
    setReportConfig({ isOpen: true, type, title });

    try {
      const data = await fetchWithRetry(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiBody),
      });
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      setGeneratedReport(text || "Geen tekst gegenereerd.");
      setReportStatus("success");
    } catch (error) {
      console.error(error);
      setGeneratedReport(`❌ Fout bij AI: ${error.message}`);
      setReportStatus("error");
    }
  };

  const handleAnalyzePhoto = async (photoId, base64Url) => {
    setAnalyzingPhotos((prev) => ({ ...prev, [photoId]: true }));
    try {
      const base64Data = base64Url.split(",")[1];
      const mimeType = base64Url.split(";")[0].split(":")[1];
      const prompt = "Analyseer deze foto van een keukeninstallatie kort. Beschrijf wat je ziet en noteer eventuele zichtbare gebreken of gereedschap. In het Nederlands.";

      const data = await fetchWithRetry(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                { inlineData: { mimeType, data: base64Data } },
              ],
            },
          ],
        }),
      });
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      const updated = projectsRef.current.map((p) =>
        p.id === activeProject.id
          ? {
              ...p,
              photos: p.photos.map((photo) =>
                photo.id === photoId ? { ...photo, aiCaption: text } : photo
              ),
            }
          : p
      );

      await saveToDB(updated);
      setProjects(updated);
      showNotification("✨ AI Analyse voltooid!");
    } catch (error) {
      console.error(error);
      showNotification(`❌ Fout AI: ${error.message}`);
    } finally {
      setAnalyzingPhotos((prev) => ({ ...prev, [photoId]: false }));
    }
  };

  const handleChatImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setChatImage(reader.result);
      reader.readAsDataURL(file);
    }
    event.target.value = null;
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() && !chatImage) return;

    const userText = chatInput.trim() || "Wat zie je op deze foto?";
    const currentImage = chatImage;

    setChatMessages((prev) => [
      ...prev,
      { role: "user", text: userText, image: currentImage },
    ]);
    setChatInput("");
    setChatImage(null);
    setIsChatLoading(true);

    try {
      const prompt = `Je bent expert keukenmonteur. Geef kort, praktisch advies. Vraag: "${userText}"`;

      let apiBody;
      if (currentImage) {
        const base64Data = currentImage.split(",")[1];
        const mimeType = currentImage.split(";")[0].split(":")[1];
        apiBody = {
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                { inlineData: { mimeType, data: base64Data } },
              ],
            },
          ],
        };
      } else {
        apiBody = { contents: [{ parts: [{ text: prompt }] }] };
      }

      const data = await fetchWithRetry(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiBody),
      });
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, ik kon geen antwoord genereren.";

      setChatMessages((prev) => [...prev, { role: "assistant", text }]);
    } catch (error) {
      console.error(error);
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", text: `❌ Fout AI: ${error.message}` },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleTranslateReport = async (language) => {
    if (!generatedReport) return;
    setIsTranslating(true);
    try {
      const prompt = `Vertaal deze tekst naar het ${language}:\n"${generatedReport}"`;

      const data = await fetchWithRetry(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || generatedReport;
      setGeneratedReport(text);
      showNotification(`✨ Vertaald naar het ${language}!`);
    } catch (error) {
      console.error(error);
      showNotification(`❌ Fout AI: ${error.message}`);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleStructureNote = async () => {
    if (!activeProject?.notes.trim()) return;
    setIsNoteLoading(true);

    try {
      const prompt = `Je bent administratief assistent. Maak een overzichtelijk verslag met bullet points van deze ruwe notities: "${activeProject.notes}". Schrijf foutloos Nederlands.`;

      const data = await fetchWithRetry(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

      const updated = projectsRef.current.map((p) =>
        p.id === activeProject.id ? { ...p, notes: text } : p
      );

      await saveToDB(updated);
      setProjects(updated);

      showNotification("✨ Notities overzichtelijk opgesomd!");
    } catch (error) {
      console.error(error);
      showNotification(`❌ Fout AI: ${error.message}`);
    } finally {
      setIsNoteLoading(false);
    }
  };

  // --- COMPONENTEN ---

  const renderHeader = () => (
    <header className="bg-slate-900 text-white sticky top-0 z-40 shadow-lg px-4 h-16 flex items-center justify-between">
      <div
        className="flex items-center gap-2 cursor-pointer group"
        onClick={() => magicUploadRef.current?.click()}
      >
        <div className="bg-blue-600 p-2 rounded-lg group-hover:bg-blue-500 transition-colors">
          {isMagicLoading ? (
            <Loader2 className="animate-spin" size={20} />
          ) : (
            <FolderOpen size={20} />
          )}
        </div>
        <h1 className="font-bold text-lg sm:text-xl tracking-tight">
          Goossens<span className="text-blue-400">Docs</span>
        </h1>
      </div>
      <div className="flex items-center gap-3">
        <div
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
            isOnline
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-amber-500/10 text-amber-400"
          }`}
        >
          {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
          <span className="hidden sm:inline">
            {isOnline ? "ONLINE" : "OFFLINE"}
          </span>
        </div>
        <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center font-bold text-blue-400 border border-slate-600">
          G
        </div>
      </div>
      <input
        type="file"
        ref={magicUploadRef}
        className="hidden"
        accept="image/*"
        onChange={handleMagicUpload}
      />
    </header>
  );

  const renderNotificationToast = () => {
    if (!notification) return null;
    return (
      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center justify-center gap-3 z-[60] animate-in fade-in slide-in-from-bottom-4 w-[90%] sm:w-auto">
        <CheckCircle size={20} className="shrink-0" />
        <span className="font-bold text-sm text-center">{notification}</span>
      </div>
    );
  };

  const renderProjectListView = () => (
    <div className="w-full animate-in fade-in duration-300">
      <div className="mb-6 md:mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">
            Projecten
          </h2>
          <p className="text-slate-500 text-sm">
            Beheer de keukeninstallaties van Goossens.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl font-bold shadow-md hover:bg-blue-700 transition-all active:scale-95"
        >
          <Plus size={20} /> Nieuw Project
        </button>
      </div>

      <div className="relative">
        <Search
          className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
          size={20}
        />
        <input
          type="text"
          placeholder="Zoek op naam of dossier..."
          className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-2xl shadow-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all text-lg"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="grid gap-4 mt-6">
        {filteredProjects.length > 0 ? (
          filteredProjects.map((p) => (
            <div
              key={p.id}
              onClick={() => {
                setSelectedProjectId(p.id);
                setActiveView("detail");
              }}
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 cursor-pointer transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
            >
              <div className="space-y-1 flex-1">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                  <h3 className="font-bold text-lg sm:text-xl text-slate-800">
                    {p.name}
                  </h3>
                  <span
                    className={`text-[10px] uppercase tracking-widest px-2.5 py-0.5 rounded-full font-bold whitespace-nowrap ${
                      p.status === "In uitvoering"
                        ? "bg-blue-100 text-blue-700"
                        : p.status === "Afgewerkt"
                        ? "bg-emerald-100 text-emerald-700"
                        : p.status === "Service nodig"
                        ? "bg-rose-100 text-rose-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-slate-500 mt-2 sm:mt-3">
                  <span className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md">
                    <Calendar size={14} />
                    {p.date.split("-").reverse().join("-")}
                    <span className="text-indigo-300">|</span> {p.duration}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs sm:text-sm bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                    <FolderOpen size={14} /> {p.id}
                  </span>
                </div>
              </div>
              <div className="bg-blue-50 px-4 py-2 sm:py-3 rounded-lg text-blue-600 font-bold flex items-center justify-center gap-2 text-sm sm:text-base w-full sm:w-auto shrink-0">
                <ImageIcon size={18} /> {p.photos?.length || 0} foto's
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200">
            <p className="text-slate-400 font-medium text-sm italic">
              Geen projecten gevonden. Voeg er een toe of scan de planning via
              het blauwe map-icoon linksboven.
            </p>
          </div>
        )}
      </div>
    </div>
  );

  const renderProjectDetailView = () => {
    if (!activeProject) return null;

    return (
      <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
        <button
          onClick={() => setActiveView("list")}
          className="flex items-center gap-2 text-slate-500 font-bold hover:text-slate-800 transition-colors"
        >
          <ChevronLeft size={20} /> Terug
        </button>

        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            <div className="flex flex-col gap-1 w-full">
              <div className="flex items-center gap-3">
                <h2 className="text-3xl font-black text-slate-800">
                  {activeProject.name}
                </h2>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap ${
                    activeProject.status === "In uitvoering"
                      ? "bg-blue-100 text-blue-700"
                      : activeProject.status === "Afgewerkt"
                      ? "bg-emerald-100 text-emerald-700"
                      : activeProject.status === "Service nodig"
                      ? "bg-rose-100 text-rose-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {activeProject.status}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-slate-500 mt-2 font-bold">
                <span
                  className="flex items-center gap-1.5 cursor-pointer hover:text-rose-500 transition-colors bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 shadow-sm"
                  onDoubleClick={() => setProjectToDelete(activeProject)}
                  title="Dubbelklik om map te verwijderen"
                >
                  <FolderOpen size={16} /> {activeProject.id}
                </span>
                <span className="flex items-center gap-1.5 text-indigo-700 font-bold bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 shadow-sm">
                  <Calendar size={16} />{" "}
                  {activeProject.date.split("-").reverse().join("-")}
                  <span className="text-indigo-300 mx-0.5">|</span>
                  <Clock size={16} /> {activeProject.duration}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="flex flex-col items-center justify-center p-6 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-all shadow-md active:scale-95 group"
            >
              <Camera
                size={32}
                className="mb-2 group-hover:scale-110 transition-transform"
              />
              <span className="font-bold text-sm sm:text-base uppercase tracking-widest text-center">
                Foto Nemen
              </span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center p-6 bg-white border-2 border-slate-200 text-slate-600 rounded-2xl hover:border-blue-300 hover:bg-blue-50 transition-all active:scale-95 group"
            >
              <Upload
                size={32}
                className="mb-2 group-hover:scale-110 transition-transform text-slate-400"
              />
              <span className="font-bold text-sm sm:text-base uppercase tracking-widest text-center">
                Uploaden
              </span>
            </button>
          </div>

          {/* STATUS OPLEVERING */}
          <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-sm">
            <h3 className="text-lg sm:text-xl font-black text-slate-800 mb-2 flex items-center gap-2">
              <CheckCircle size={22} className="text-slate-400 shrink-0" />
              Status Oplevering
            </h3>
            <p className="text-sm text-slate-500 mb-4 font-medium">
              Heb je alle foto's geüpload? Duid hier de actuele status aan.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <button
                onClick={() => handleUpdateStatus("Afgewerkt")}
                className={`flex-1 flex items-center justify-center gap-2 py-3 sm:py-4 px-2 rounded-xl border-2 font-bold transition-all text-sm sm:text-base ${
                  activeProject.status === "Afgewerkt"
                    ? "bg-emerald-50 border-emerald-500 text-emerald-700 shadow-sm"
                    : "bg-white border-slate-200 text-slate-600 hover:border-emerald-300 hover:bg-emerald-50"
                }`}
              >
                <CheckCircle size={20} className="shrink-0" />
                <span>
                  Afgewerkt{" "}
                  <span className="hidden sm:inline">(Geen Service)</span>
                </span>
              </button>
              <button
                onClick={() => handleUpdateStatus("Service nodig")}
                className={`flex-1 flex items-center justify-center gap-2 py-3 sm:py-4 px-2 rounded-xl border-2 font-bold transition-all text-sm sm:text-base ${
                  activeProject.status === "Service nodig"
                    ? "bg-rose-50 border-rose-500 text-rose-700 shadow-sm"
                    : "bg-white border-slate-200 text-slate-600 hover:border-rose-300 hover:bg-rose-50"
                }`}
              >
                <AlertTriangle size={20} className="shrink-0" />
                <span>Service Nodig</span>
              </button>
            </div>

            {/* WERKJTIJDEN (Enkel zichtbaar bij Service nodig) */}
            {activeProject
