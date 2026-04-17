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

// --- HELPER FUNCTIE VOOR ROBUUSTE API CALLS (EXPONENTIAL BACKOFF) ---
const fetchWithRetry = async (url, options, retries = 5) => {
  const delays = [1000, 2000, 4000, 8000, 16000];
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise((r) => setTimeout(r, delays[i]));
    }
  }
};

export default function App() {
  const [projects, setProjects] = useState(initialProjects);
  const [activeView, setActiveView] = useState("list");
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [notification, setNotification] = useState(null);

  // --- REFERENTIE VOOR VEILIG OPSLAAN ---
  const projectsRef = useRef(projects);
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  // --- OFFLINE & SYNC STATE ---
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // --- AI STATE ---
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

  // --- CHAT VISION & VERTALING STATE ---
  const [chatImage, setChatImage] = useState(null);
  const chatFileInputRef = useRef(null);
  const [isTranslating, setIsTranslating] = useState(false);

  // --- MANUEEL PROJECT TOEVOEGEN STATE ---
  const [showAddModal, setShowAddModal] = useState(false);
  const [newProjectData, setNewProjectData] = useState({
    name: "",
    id: "",
    date: "",
    duration: "1 dag",
  });

  // --- MAP VERWIJDEREN STATE ---
  const [projectToDelete, setProjectToDelete] = useState(null);

  // --- MAGIC UPLOAD STATE ---
  const [isMagicLoading, setIsMagicLoading] = useState(false);
  const magicUploadRef = useRef(null);

  const apiKey = "AQ.Ab8RN6JJciNvbyACX9j-GOiLQWC_E2eE6uRBRMVfTuDmygJ4wQ";

  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const activeProject = projects.find((p) => p.id === selectedProjectId);

  // Helper functie om datum te vergelijken voor automatische status
  const getDerivedStatus = (currentStatus, projectDate) => {
    if (currentStatus !== "Gepland") return currentStatus;

    const today = new Date().toISOString().split("T")[0];
    if (projectDate <= today) {
      return "In uitvoering";
    }
    return "Gepland";
  };

  // --- INITIEEL INLADEN ---
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

  // --- ACHTERGROND AUTO-SYNC (bij weer online komen) ---
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

  // --- ACTIES MET GEFORCEERDE DIRECTE OPSLAG ---

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

  // --- VERBORGEN PLANNING SCANNER (MAGIC UPLOAD) ---
  const handleMagicUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

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
      Let HEEL GOED op de balk of kolommen bovenaan waar vaak dagen of datums staan (bijv. 1, 2, 3... of Ma, Di...).
      
      Extraheer de volgende informatie per project: 
      - dossiernummer (als id, verzin er een met 'PRJ-' als het ontbreekt)
      - klantnaam (als name)
      - exacte startdatum van plaatsing (als date in YYYY-MM-DD formaat). Bepaal deze startdatum door te kijken onder welke kolom/dag het project begint. Ga er in geval van twijfel van uit dat de huidige maand/jaar van toepassing is.
      - duur van de plaatsing (als duration, analyseer over hoeveel dagen/kolommen het project zich uitstrekt, bijv. '1 dag', '2 dagen').
      
      Retourneer de data UITSLUITEND als een ruwe JSON array, zonder markdown en zonder extra tekst.
      Voorbeeld output:
      [{"id": "123", "name": "Janssens", "date": "2026-05-01", "duration": "2 dagen"}]`;

      const data = await fetchWithRetry(
       `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, 
        {
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
        }
      );

      let aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
      aiText = aiText
        .replace(/```json/gi, "")
        .replace(/```/gi, "")
        .trim();
      if (!aiText) aiText = "[]";

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
          const projectDate =
            proj.date || new Date().toISOString().split("T")[0];
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
          ...currentProjects.filter(
            (p) => !newProjects.some((np) => np.id === p.id)
          ),
        ];
        const sorted = combined.sort(
          (a, b) => new Date(a.date) - new Date(b.date)
        );

        await saveToDB(sorted);

        setProjects(sorted);
        showNotification(
          `✨ Succes: ${newProjects.length} projecten toegevoegd en direct opgeslagen!`
        );
      } else {
        showNotification("Kon geen geldige projecten op de foto vinden.");
      }
    } catch (error) {
      console.error(error);
      showNotification("Fout bij het uitlezen van de planning.");
    } finally {
      setIsMagicLoading(false);
      event.target.value = null;
    }
  };

  // --- GEMINI AI FUNCTIES ---

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
      promptText = `Schrijf een zeer professionele, elegante e-mail naar de klant (${activeProject.name}). 
      Informeer de klant uitsluitend over het volgende: de plaatsers hebben doorgegeven dat er nog enkele servicepunten openstaan. Verzeker de klant ervan dat deze punten succesvol zijn overgedragen aan onze serviceafdeling en zo snel mogelijk verwerkt zullen worden. 
      Gebruik een hoogwaardige, zakelijke maar warme tone-of-voice. Zorg voor een overzichtelijke en mooie opmaak met voldoende witregels. Formatteer dit in het Nederlands.`;
      apiBody = { contents: [{ parts: [{ text: promptText }] }] };
    } else if (type === "snaglist") {
      title = "Interne Actielijst (Snag List)";
      promptText = `Je bent een werkvoorbereider/projectleider voor een keukeninstallatiebedrijf. Hier zijn de notities en AI-analyses van de foto's gemaakt tijdens het project bij ${
        activeProject.name
      }:\n
      Notities: ${activeProject.notes || "Geen notities"}\n
      Foto's: ${photoContext || "(Geen foto analyses)"}\n\n
      Maak op basis hiervan een beknopte, puntsgewijze actielijst voor de binnendienst. Noem expliciet zaken die nog afgewerkt, hersteld of besteld moeten worden. Antwoord in het Nederlands.`;
      apiBody = { contents: [{ parts: [{ text: promptText }] }] };
    }

    setReportStatus("loading");
    setReportConfig({ isOpen: true, type, title });

    try {
      const data = await fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(apiBody),
        }
      );
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      setGeneratedReport(text || "Geen tekst gegenereerd.");
      setReportStatus("success");
    } catch (error) {
      console.error(error);
      setGeneratedReport(
        "Er is een fout opgetreden bij het genereren via de AI. Controleer de internetverbinding."
      );
      setReportStatus("error");
    }
  };

  const handleAnalyzePhoto = async (photoId, base64Url) => {
    setAnalyzingPhotos((prev) => ({ ...prev, [photoId]: true }));
    try {
      const base64Data = base64Url.split(",")[1];
      const mimeType = base64Url.split(";")[0].split(":")[1];
      const prompt =
        "Analyseer deze foto van een keukeninstallatie. Beschrijf in 1 of 2 korte zinnen wat er te zien is (bijv. 'Kasten en werkblad geplaatst'). Noteer ook expliciet of je zichtbare gebreken, achtergebleven gereedschap, of onafgewerkte delen ziet. Antwoord uitsluitend in het Nederlands.";

      const data = await fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
        {
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
        }
      );
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
      showNotification("Fout bij AI analyse.");
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
      const prompt = `Je bent een expert keukenmonteur met 20 jaar ervaring. Geef kort, praktisch en veilig advies aan collega monteurs op de werkvloer. Antwoord altijd behulpzaam en in correct, duidelijk Nederlands. 
      Vraag van de monteur: "${userText}"`;

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

      const data = await fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(apiBody),
        }
      );
      const text =
        data.candidates?.[0]?.content?.parts?.[0]?.text ||
        "Sorry, ik kon geen antwoord genereren.";

      setChatMessages((prev) => [...prev, { role: "assistant", text }]);
    } catch (error) {
      console.error(error);
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Fout bij het verbinden met de AI." },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleTranslateReport = async (language) => {
    if (!generatedReport) return;
    setIsTranslating(true);
    try {
      const prompt = `Vertaal de volgende tekst naar het ${language}. Behoud de professionele toon, de opmaak en de context van het rapport/bericht.
      Tekst:
      "${generatedReport}"`;

      const data = await fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        }
      );
      const text =
        data.candidates?.[0]?.content?.parts?.[0]?.text || generatedReport;
      setGeneratedReport(text);
      showNotification(`✨ Vertaald naar het ${language}!`);
    } catch (error) {
      console.error(error);
      showNotification("Fout bij het vertalen.");
    } finally {
      setIsTranslating(false);
    }
  };

  const handleStructureNote = async () => {
    if (!activeProject?.notes.trim()) return;
    setIsNoteLoading(true);

    try {
      const prompt = `Je bent een administratief assistent voor Goossens Keukens.
      Hier zijn ruwe notities van de monteur: "${activeProject.notes}"
      
      Maak hier een zeer overzichtelijk, strak en professioneel verslag van. 
      Gebruik ALTIJD duidelijke opsommingstekens (bullet points) voor de actiepunten of servicepunten.
      Zorg dat het document direct leesbaar is voor de klantenservice en planning. Schrijf in foutloos Nederlands en voeg geen onnodige introducties toe.`;

      const data = await fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        }
      );
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

      const updated = projectsRef.current.map((p) =>
        p.id === activeProject.id ? { ...p, notes: text } : p
      );

      await saveToDB(updated);
      setProjects(updated);

      showNotification("✨ Notities overzichtelijk opgesomd!");
    } catch (error) {
      console.error(error);
      showNotification("Fout bij het herschrijven van de notitie.");
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
              onClick={() => cameraInputRef.current.click()}
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
              onClick={() => fileInputRef.current.click()}
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
            {activeProject.status === "Service nodig" && (
              <div className="mb-6 p-4 bg-rose-50 rounded-2xl border border-rose-100 animate-in fade-in">
                <label className="block text-sm font-bold text-rose-800 mb-2 flex items-center gap-2">
                  <Clock size={16} /> Geschatte Resterende Werkuren (Service)
                </label>
                <select
                  className="w-full p-3 bg-white border border-rose-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-sm text-slate-700 appearance-none font-medium"
                  value={activeProject.workHours || ""}
                  onChange={(e) => handleUpdateWorkHours(e.target.value)}
                >
                  <option value="" disabled>
                    Selecteer aantal uren...
                  </option>
                  <option value="0.5 uur">0.5 uur</option>
                  <option value="1 uur">1 uur</option>
                  <option value="1.5 uur">1.5 uur</option>
                  <option value="2 uur">2 uur</option>
                  <option value="2.5 uur">2.5 uur</option>
                  <option value="3 uur">3 uur</option>
                  <option value="3.5 uur">3.5 uur</option>
                  <option value="4 uur">4 uur</option>
                  <option value="4.5 uur">4.5 uur</option>
                  <option value="5 uur">5 uur</option>
                  <option value="5.5 uur">5.5 uur</option>
                  <option value="6 uur">6 uur</option>
                  <option value="6.5 uur">6.5 uur</option>
                  <option value="7 uur">7 uur</option>
                  <option value="7.5 uur">7.5 uur</option>
                  <option value="8 uur">8 uur</option>
                  <option value="Meer dan 8 uur">Meer dan 8 uur</option>
                </select>
              </div>
            )}

            {/* LOGBOEK */}
            <div className="pt-6 border-t border-slate-100 space-y-3">
              <p className="text-sm font-black text-slate-800 mb-2 flex items-center gap-2">
                <PenTool size={18} className="text-slate-400" />
                Project Logboek / Service Punten
              </p>
              <textarea
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none min-h-[150px] text-sm font-medium leading-relaxed"
                placeholder="Typ hier de ruwe werfnotities of servicepunten..."
                value={activeProject.notes}
                onChange={(e) => {
                  const val = e.target.value;
                  setProjects((prev) =>
                    prev.map((p) =>
                      p.id === activeProject.id ? { ...p, notes: val } : p
                    )
                  );
                }}
                onBlur={() => saveToDB(projectsRef.current)} // Extra zekerheid bij het wegklikken
              />
              <button
                onClick={handleStructureNote}
                disabled={isNoteLoading}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-50 text-indigo-700 border border-indigo-200 px-5 py-3 rounded-xl font-bold text-sm shadow-sm hover:bg-indigo-100 disabled:opacity-50"
              >
                {isNoteLoading ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <ListChecks size={16} />
                )}{" "}
                Automatisch Punten Maken (AI)
              </button>
            </div>
          </div>

          {/* AI ACTION GRID */}
          {activeProject.status === "Service nodig" && (
            <div className="bg-indigo-50/50 p-5 sm:p-6 rounded-3xl border border-indigo-100">
              <h3 className="text-sm sm:text-base font-black text-indigo-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Sparkles size={18} /> Slimme AI Acties
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => handleGenerateReport("email")}
                  className="bg-white p-4 sm:p-5 rounded-2xl border border-indigo-100 flex flex-col items-center justify-center gap-2 hover:bg-indigo-50 hover:border-indigo-300 transition-all shadow-sm active:scale-95 text-center"
                >
                  <span className="text-indigo-500">
                    <FileText size={24} />
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-indigo-800">
                    E-mail Klant (Service)
                  </span>
                </button>
                <button
                  onClick={() => handleGenerateReport("snaglist")}
                  className="bg-white p-4 sm:p-5 rounded-2xl border border-indigo-100 flex flex-col items-center justify-center gap-2 hover:bg-indigo-50 hover:border-indigo-300 transition-all shadow-sm active:scale-95 text-center"
                >
                  <span className="text-indigo-500">
                    <ListChecks size={24} />
                  </span>
                  <span className="text-xs sm:text-sm font-bold text-indigo-800">
                    Genereer Actielijst
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* FOTO GRID */}
          <div className="space-y-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
              Foto Documentatie ({activeProject.photos.length})
            </p>
            {activeProject.photos.length === 0 ? (
              <div className="py-12 border-2 border-dashed border-slate-200 rounded-3xl text-center text-slate-400 font-bold italic text-sm">
                Geen foto's in deze map.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {activeProject.photos.map((ph) => (
                  <div
                    key={ph.id}
                    className="bg-slate-50 rounded-2xl overflow-hidden border border-slate-200 flex flex-col shadow-sm"
                  >
                    <div className="relative aspect-video">
                      <img
                        src={ph.url}
                        className="w-full h-full object-cover"
                        alt="Werffoto"
                      />
                      <div className="absolute top-2 right-2">
                        {ph.syncStatus === "synced" ? (
                          <Cloud
                            className="text-emerald-400 drop-shadow"
                            size={16}
                          />
                        ) : (
                          <CloudOff
                            className="text-amber-400 drop-shadow"
                            size={16}
                          />
                        )}
                      </div>
                    </div>
                    <div className="p-4 space-y-3">
                      {ph.aiCaption ? (
                        <div className="bg-purple-50 p-3 rounded-xl text-xs text-purple-700 font-medium leading-relaxed border border-purple-100 flex gap-2">
                          <Sparkles
                            size={12}
                            className="shrink-0 text-purple-400"
                          />{" "}
                          {ph.aiCaption}
                        </div>
                      ) : (
                        <button
                          onClick={() => handleAnalyzePhoto(ph.id, ph.url)}
                          disabled={analyzingPhotos[ph.id]}
                          className="w-full py-2 rounded-lg bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 disabled:opacity-50"
                        >
                          {analyzingPhotos[ph.id] ? (
                            <Loader2
                              className="animate-spin inline mr-2"
                              size={12}
                            />
                          ) : (
                            <Sparkles size={12} className="inline mr-2" />
                          )}{" "}
                          Analyseer Foto (AI)
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-24">
      {renderHeader()}
      <main className="max-w-6xl mx-auto p-4 sm:p-6">
        {activeView === "list"
          ? renderProjectListView()
          : renderProjectDetailView()}
      </main>

      {/* AI REPORT MODAL */}
      {reportConfig.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 text-xs sm:text-sm">
                <Sparkles className="text-blue-500" size={18} />{" "}
                {reportConfig.title}
              </h3>
              <button
                onClick={() =>
                  setReportConfig({ ...reportConfig, isOpen: false })
                }
                className="p-2 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 bg-white">
              {reportStatus === "loading" ? (
                <div className="py-20 text-center space-y-4">
                  <Loader2
                    className="animate-spin mx-auto text-blue-600"
                    size={40}
                  />
                  <p className="font-bold text-slate-400 uppercase tracking-widest text-[10px]">
                    AI stelt document op...
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <textarea
                    className="w-full min-h-[300px] p-4 bg-slate-50 border border-slate-200 rounded-2xl font-sans text-slate-700 text-sm leading-relaxed outline-none"
                    value={generatedReport}
                    onChange={(e) => setGeneratedReport(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-2 pt-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest w-full mb-1">
                      Vertalen:
                    </span>
                    <button
                      onClick={() => handleTranslateReport("Frans")}
                      disabled={isTranslating}
                      className="bg-blue-50 text-blue-700 px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-100 disabled:opacity-50"
                    >
                      🇫🇷 Frans
                    </button>
                    <button
                      onClick={() => handleTranslateReport("Engels")}
                      disabled={isTranslating}
                      className="bg-rose-50 text-rose-700 px-4 py-2 rounded-xl text-xs font-bold hover:bg-rose-100 disabled:opacity-50"
                    >
                      🇬🇧 Engels
                    </button>
                  </div>
                  <div className="flex justify-end gap-3 pt-4">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(generatedReport);
                        showNotification("Gekopieerd naar klembord!");
                      }}
                      className="px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 text-xs"
                    >
                      Kopieer
                    </button>
                    <button
                      onClick={() =>
                        setReportConfig({ ...reportConfig, isOpen: false })
                      }
                      className="px-6 py-3 bg-slate-900 text-white rounded-xl font-bold shadow-lg text-xs"
                    >
                      Sluiten
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CHAT WIDGET */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
        {isChatOpen && (
          <div className="bg-white w-[calc(100vw-2rem)] sm:w-96 rounded-3xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col h-[500px] mb-4 animate-in slide-in-from-bottom-4">
            <div className="bg-slate-900 p-4 flex justify-between items-center text-white">
              <div className="flex items-center gap-2">
                <Sparkles className="text-blue-400" size={18} />
                <span className="font-bold tracking-tight">
                  Montage Assistent
                </span>
              </div>
              <button onClick={() => setIsChatOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
              {chatMessages.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[85%] p-3 rounded-2xl text-sm font-medium ${
                    m.role === "user"
                      ? "bg-blue-600 text-white self-end rounded-tr-none ml-auto"
                      : "bg-white text-slate-700 border border-slate-200 self-start rounded-tl-none"
                  }`}
                >
                  {m.image && (
                    <img
                      src={m.image}
                      className="rounded-lg mb-2 border border-black/10"
                    />
                  )}
                  <p className="whitespace-pre-wrap leading-relaxed">
                    {m.text}
                  </p>
                </div>
              ))}
              {isChatLoading && (
                <div className="bg-white border border-slate-200 p-3 rounded-2xl self-start rounded-tl-none flex items-center gap-2 text-xs font-bold text-slate-400">
                  <Loader2 className="animate-spin" size={14} /> AI denkt na...
                </div>
              )}
            </div>
            {chatImage && (
              <div className="p-2 bg-slate-200 flex gap-2">
                <div className="relative w-12 h-12">
                  <img
                    src={chatImage}
                    className="w-full h-full object-cover rounded"
                  />
                  <button
                    onClick={() => setChatImage(null)}
                    className="absolute -top-1 -right-1 bg-rose-500 text-white rounded-full p-0.5"
                  >
                    <X size={10} />
                  </button>
                </div>
              </div>
            )}
            <div className="p-3 bg-white border-t border-slate-100 flex items-center gap-2">
              <button
                onClick={() => chatFileInputRef.current?.click()}
                className="p-2 text-slate-400 hover:text-blue-600 transition-colors shrink-0"
              >
                <Paperclip size={20} />
              </button>
              <input
                type="text"
                className="flex-1 bg-slate-100 border-none rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Vraag iets..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              />
              <button
                onClick={handleSendMessage}
                className="bg-blue-600 text-white p-2 rounded-xl shrink-0"
              >
                <Send size={18} />
              </button>
            </div>
            <input
              type="file"
              ref={chatFileInputRef}
              className="hidden"
              accept="image/*"
              onChange={handleChatImageUpload}
            />
          </div>
        )}
        <button
          onClick={() => setIsChatOpen(true)}
          className="bg-slate-900 text-white p-4 rounded-full shadow-2xl hover:scale-110 transition-all shadow-blue-500/20"
        >
          <MessageSquare size={24} />
        </button>
      </div>

      {/* MODALS: ADD/DELETE */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleAddProject}
            className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-200"
          >
            <div className="p-6 bg-slate-50 border-b flex justify-between items-center">
              <h3 className="font-black uppercase tracking-widest text-[10px]">
                Nieuw Project
              </h3>
              <button type="button" onClick={() => setShowAddModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <input
                type="text"
                placeholder="Naam Klant"
                required
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                value={newProjectData.name}
                onChange={(e) =>
                  setNewProjectData({ ...newProjectData, name: e.target.value })
                }
              />
              <input
                type="text"
                placeholder="Dossiernummer"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                value={newProjectData.id}
                onChange={(e) =>
                  setNewProjectData({ ...newProjectData, id: e.target.value })
                }
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="date"
                  required
                  className="p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={newProjectData.date}
                  onChange={(e) =>
                    setNewProjectData({
                      ...newProjectData,
                      date: e.target.value,
                    })
                  }
                />
                <select
                  className="p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm"
                  value={newProjectData.duration}
                  onChange={(e) =>
                    setNewProjectData({
                      ...newProjectData,
                      duration: e.target.value,
                    })
                  }
                >
                  <option>1 dag</option>
                  <option>2 dagen</option>
                  <option>3 dagen</option>
                </select>
              </div>
            </div>
            <div className="p-6 bg-slate-50 flex gap-3">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-3 font-bold text-slate-500 text-xs"
              >
                Stop
              </button>
              <button
                type="submit"
                className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold text-xs shadow-lg"
              >
                Opslaan
              </button>
            </div>
          </form>
        </div>
      )}

      {projectToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-8 text-center animate-in zoom-in-95 duration-200">
            <div className="bg-rose-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-rose-600">
              <AlertTriangle size={32} />
            </div>
            <h3 className="text-xl font-black mb-2">Verwijderen?</h3>
            <p className="text-slate-500 text-sm mb-8">
              Weet je zeker dat je <strong>{projectToDelete.name}</strong> wilt
              wissen?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setProjectToDelete(null)}
                className="flex-1 py-3 font-bold text-xs text-slate-400"
              >
                Nee
              </button>
              <button
                onClick={() => {
                  const updated = projectsRef.current.filter(
                    (p) => p.id !== projectToDelete.id
                  );
                  setProjects(updated);
                  saveToDB(updated);
                  setProjectToDelete(null);
                  setActiveView("list");
                  showNotification("Project verwijderd.");
                }}
                className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-bold text-xs shadow-lg"
              >
                Ja, Wis
              </button>
            </div>
          </div>
        </div>
      )}

      {renderNotificationToast()}
    </div>
  );
}
