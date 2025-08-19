const financialYears = [];
for (let year = 2010; year <= 2099; year++) {
  financialYears.push(`${year}-${year + 1}`);
}

// Register Chart.js plugins
Chart.register(ChartDataLabels);

// Global variables
let currentType = "supply";
let currentFinancialYear = getCurrentFinancialYear();
let tableData = [];
let currentUser = null;

// Function to get current financial year (April to March)
function getCurrentFinancialYear() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // getMonth() returns 0-11
  
  if (currentMonth >= 4) { // April to December
    return `${currentYear}-${currentYear + 1}`;
  } else { // January to March
    return `${currentYear - 1}-${currentYear}`;
  }
}
let sessionTimeout = null;
let warningTimeout = null;
let sessionCheckInterval = null;
let socket = null;

// Dashboard charts
let deliveryChart = null;
let trendChart = null;
let comparisonChart = null;
let valueComparisonChart = null;
let advancedChart = null;

// WebSocket and real-time synchronization functions
function initializeWebSocket() {
  if (currentUser) {
    socket = io({
      auth: {
        sessionId: 'session-' + currentUser.username + '-' + Date.now()
      }
    });

    socket.on('connect', () => {
      console.log('Connected to real-time server');
      // Join rooms for current data views
      joinDataRoom();
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from real-time server');
    });

    socket.on('data-change', (changeData) => {
      handleRealTimeDataChange(changeData);
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
    });
  }
}

function joinDataRoom() {
  if (socket && currentUser) {
    const room = `${currentType}-${currentFinancialYear}`;
    socket.emit('join-room', room);
  }
}

function leaveDataRoom() {
  if (socket && currentUser) {
    const room = `${currentType}-${currentFinancialYear}`;
    socket.emit('leave-room', room);
  }
}

function handleRealTimeDataChange(changeData) {
  const { type, action, data, timestamp } = changeData;

  // Only handle changes for the currently viewed register and year
  if (type !== currentType) return;

  console.log(`Real-time ${action} received for ${type}:`, data);

  // Show notification
  showRealTimeNotification(action, type, data);

  // Refresh the current view
  setTimeout(() => {
    loadData(currentType);
  }, 1000);
}

function showRealTimeNotification(action, type, data) {
  const notification = document.createElement('div');
  notification.className = 'fixed top-4 right-4 bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded-lg shadow-lg z-50';

  let message = '';
  switch (action) {
    case 'create':
      message = `New ${type} record added`;
      break;
    case 'update':
      message = `${type} record updated`;
      break;
    case 'delete':
      message = `${type} record deleted`;
      break;
    default:
      message = `${type} data changed`;
  }

  notification.innerHTML = `
    <div class="flex items-center">
      <div class="flex-1">
        <strong>Real-time Update:</strong> ${message}
      </div>
      <button onclick="this.parentElement.parentElement.remove()" class="ml-2 text-blue-700 hover:text-blue-900">×</button>
    </div>
  `;

  document.body.appendChild(notification);

  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (notification.parentElement) {
      notification.remove();
    }
  }, 5000);
}

function disconnectWebSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

// Session management functions
function startSessionTimer() {
  clearTimeout(sessionTimeout);
  clearTimeout(warningTimeout);

  // Warning 5 minutes before timeout (25 minutes)
  warningTimeout = setTimeout(() => {
    if (confirm("Your session will expire in 5 minutes. Do you want to extend it?")) {
      extendSession();
    }
  }, 25 * 60 * 1000);

  // Auto logout after 30 minutes
  sessionTimeout = setTimeout(() => {
    alert("Session expired. Please login again.");
    logout();
  }, 30 * 60 * 1000);
}

function resetSessionTimer() {
  if (currentUser) {
    startSessionTimer();
  }
}

async function extendSession() {
  try {
    const response = await fetch("/api/extend-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });

    if (response.ok) {
      resetSessionTimer();
    }
  } catch (error) {
    console.error("Session extension error:", error);
  }
}

async function checkSession() {
  try {
    const response = await fetch("/api/session");
    if (!response.ok) {
      if (currentUser) {
        alert("Session expired. Please login again.");
        logout();
      }
    }
  } catch (error) {
    console.error("Session check error:", error);
  }
}

// Add activity listeners to reset session timer
function addActivityListeners() {
  const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
  events.forEach(event => {
    document.addEventListener(event, resetSessionTimer, true);
  });
}

// Keyboard shortcuts functionality
function addKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Check if user is typing in an input field
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      return;
    }

    // Prevent shortcuts if user is not logged in
    if (!currentUser) {
      return;
    }

    // Handle keyboard shortcuts
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'n': // Ctrl/Cmd + N - Add new row
          e.preventDefault();
          addNewRowShortcut();
          break;
        case 'f': // Ctrl/Cmd + F - Focus search
          e.preventDefault();
          focusSearchShortcut();
          break;
        case 'e': // Ctrl/Cmd + E - Export to Excel
          e.preventDefault();
          exportCurrentRegisterShortcut();
          break;
        case 'd': // Ctrl/Cmd + D - Toggle dashboard
          e.preventDefault();
          toggleDashboardShortcut();
          break;
        case 'l': // Ctrl/Cmd + L - Logout
          e.preventDefault();
          if (confirm('Are you sure you want to logout?')) {
            logout();
          }
          break;
        case '/': // Ctrl/Cmd + / - Show keyboard shortcuts help
        case '?': // Ctrl/Cmd + ? - Show keyboard shortcuts help
          e.preventDefault();
          showKeyboardShortcutsHelp();
          break;
      }
    } else if (e.altKey) {
      switch (e.key) {
        case '1': // Alt + 1 - Switch to Demand Register
          e.preventDefault();
          switchToRegister('demand');
          break;
        case '2': // Alt + 2 - Switch to Supply Register
          e.preventDefault();
          switchToRegister('supply');
          break;
        case '3': // Alt + 3 - Switch to Bill Register
          e.preventDefault();
          switchToRegister('bill');
          break;
        case '4': // Alt + 4 - Switch to Sanction Register
          e.preventDefault();
          switchToRegister('sanction');
          break;
        case 'f': // Alt + F - Toggle advanced filter
          e.preventDefault();
          toggleAdvancedFilterShortcut();
          break;
        case 'd': // Alt + D - Toggle dark mode
          e.preventDefault();
          if (currentUser) {
            toggleDarkMode();
          }
          break;
      }
    } else {
      switch (e.key) {
        case 'Escape': // ESC - Close modals or cancel edits
          e.preventDefault();
          handleEscapeKey();
          break;
      }
    }
  });
}

// Keyboard shortcut helper functions
function addNewRowShortcut() {
  const currentRegister = getCurrentActiveRegister();
  if (currentRegister && currentUser && currentUser.role !== 'viewer') {
    if (['gen-project', 'misc', 'training'].includes(currentRegister)) {
      addSanctionRow(currentRegister);
    } else {
      addRow(currentRegister);
    }
  }
}

function focusSearchShortcut() {
  const currentRegister = getCurrentActiveRegister();
  if (currentRegister) {
    const searchInput = document.getElementById(`${currentRegister === 'supply' ? '' : currentRegister + '-'}search`);
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  }
}

function exportCurrentRegisterShortcut() {
  const currentRegister = getCurrentActiveRegister();
  if (currentRegister) {
    if (['gen-project', 'misc', 'training'].includes(currentRegister)) {
      exportSanctionToExcel(currentRegister);
    } else {
      exportToExcel(currentRegister);
    }
  }
}

function toggleDashboardShortcut() {
  const dashboardModal = document.getElementById('dashboard-modal');
  if (dashboardModal.classList.contains('hidden')) {
    showDashboard();
  } else {
    hideDashboard();
  }
}

function switchToRegister(register) {
  if (register === 'demand') {
    document.getElementById('demand-register-btn').click();
  } else if (register === 'supply') {
    document.getElementById('supply-register-btn').click();
  } else if (register === 'bill') {
    document.getElementById('bill-register-btn').click();
  } else if (register === 'sanction') {
    document.getElementById('sanction-register-btn').click();
  }
}

function toggleAdvancedFilterShortcut() {
  const currentRegister = getCurrentActiveRegister();
  if (currentRegister && !['gen-project', 'misc', 'training'].includes(currentRegister)) {
    toggleAdvancedFilter(currentRegister);
  }
}

function handleEscapeKey() {
  // Close dashboard modal if open
  const dashboardModal = document.getElementById('dashboard-modal');
  if (!dashboardModal.classList.contains('hidden')) {
    hideDashboard();
    return;
  }

  // Cancel any active edits
  const editingRows = document.querySelectorAll('tr input, tr select');
  if (editingRows.length > 0) {
    const firstEditingRow = editingRows[0].closest('tr');
    const cancelButton = firstEditingRow.querySelector('button[onclick*="cancelEdit"]');
    if (cancelButton) {
      cancelButton.click();
    }
  }
}

function getCurrentActiveRegister() {
  if (!document.getElementById('supply-register').classList.contains('hidden')) {
    return 'supply';
  } else if (!document.getElementById('demand-register').classList.contains('hidden')) {
    return 'demand';
  } else if (!document.getElementById('bill-register').classList.contains('hidden')) {
    return 'bill';
  } else if (!document.getElementById('sanction-register').classList.contains('hidden')) {
    // Check which sanction section is active
    if (!document.getElementById('gen-project-section').classList.contains('hidden')) {
      return 'gen-project';
    } else if (!document.getElementById('misc-section').classList.contains('hidden')) {
      return 'misc';
    } else if (!document.getElementById('training-section').classList.contains('hidden')) {
      return 'training';
    }
  }
  return null;
}

// Show keyboard shortcuts help
function showKeyboardShortcutsHelp() {
  const helpContent = `
    <div class="p-6">
      <h3 class="text-lg font-bold mb-4">Keyboard Shortcuts</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div>
          <h4 class="font-semibold mb-2">General Actions:</h4>
          <ul class="space-y-1">
            <li><kbd class="bg-gray-200 px-2 py-1 rounded">Ctrl/Cmd + N</kbd> - Add new row</li>
            <li><kbd class="bg-gray-200 px-2 py-1 rounded">Ctrl/Cmd + F</kbd> - Focus search</li>
            <li><kbd class="bg-gray-200 px-2 py-1 rounded">Ctrl/Cmd + E</kbd> - Export to Excel</li>
            <li><kbd class="bg-gray-200 px-2 py-1 rounded">Ctrl/Cmd + D</kbd> - Toggle dashboard</li>
            <li><kbd class="bg-gray-200 px-2 py-1 rounded">Ctrl/Cmd + L</kbd> - Logout</li>
            <li><kbd class="bg-gray-200 px-2 py-1 rounded">ESC</kbd> - Close modals/Cancel edits</li>
          </ul>
        </div>
        <div>
          <h4 class="font-semibold mb-2">Register Navigation:</h4>
          <ul class="space-y-1">
            <li><kbd class="bg-gray-200 px-2 py-1 rounded">Alt + 1</kbd> - Demand Register</li>
            <li><kbd class="bg-gray-200 px-2 py-1 rounded">Alt + 2</kbd> - Supply Register</li>
            <li><kbd class="bg-gray-200 px-2 py-1 rounded">Alt + 3</kbd> - Bill Register</li>
            <li><kbd class="bg-gray-200 px-2 py-1 rounded">Alt + 4</kbd> - Sanction Register</li>
            <li><kbd class="bg-gray-200 px-2 py-1 rounded">Alt + F</kbd> - Toggle advanced filter</li>
            <li><kbd class="bg-gray-200 px-2 py-1 rounded">Alt + D</kbd> - Toggle dark mode</li>
          </ul>
        </div>
      </div>
    </div>
  `;

  // Create and show help modal
  const helpModal = document.createElement('div');
  helpModal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center';
  helpModal.innerHTML = `
    <div class="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full mx-4">
      ${helpContent}
      <div class="px-6 pb-6">
        <button onclick="this.closest('.fixed').remove()" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(helpModal);
}

document.addEventListener("DOMContentLoaded", () => {
  // Initialize dark mode
  initializeDarkMode();

  // Initialize keyboard shortcuts
  addKeyboardShortcuts();

  const loginForm = document.getElementById("login-form");
  const loginContainer = document.getElementById("login-container");
  const dashboard = document.getElementById("dashboard");
  const alertContainer = document.getElementById("alert-container");
  const supplyRegister = document.getElementById("supply-register");
  const demandRegister = document.getElementById("demand-register");
  const billRegister = document.getElementById("bill-register");
  const sanctionRegister = document.getElementById("sanction-register");
  const supplyFinancialYearSelect = document.getElementById("financial-year");
  const demandFinancialYearSelect = document.getElementById("demand-financial-year");
  const billFinancialYearSelect = document.getElementById("bill-financial-year");
  const genProjectFinancialYearSelect = document.getElementById("gen-project-financial-year");
  const miscFinancialYearSelect = document.getElementById("misc-financial-year");
  const trainingFinancialYearSelect = document.getElementById("training-financial-year");
  const supplyTableBody = document.getElementById("supply-table-body");
  const demandTableBody = document.getElementById("demand-table-body");
  const billTableBody = document.getElementById("bill-table-body");
  const genProjectTableBody = document.getElementById("gen-project-table-body");
  const miscTableBody = document.getElementById("misc-table-body");
  const trainingTableBody = document.getElementById("training-table-body");
  const supplySearchInput = document.getElementById("search");
  const demandSearchInput = document.getElementById("demand-search");
  const billSearchInput = document.getElementById("bill-search");
  const genProjectSearchInput = document.getElementById("gen-project-search");
  const miscSearchInput = document.getElementById("misc-search");
  const trainingSearchInput = document.getElementById("training-search");
  const supplySortSelect = document.getElementById("sort");
  const demandSortSelect = document.getElementById("demand-sort");
  const billSortSelect = document.getElementById("bill-sort");
  const supplyImportExcel = document.getElementById("import-excel-supply");
  const demandImportExcel = document.getElementById("import-excel-demand");
  const billImportExcel = document.getElementById("import-excel-bill");
  const genProjectImportExcel = document.getElementById("import-excel-gen-project");
  const miscImportExcel = document.getElementById("import-excel-misc");
  const trainingImportExcel = document.getElementById("import-excel-training");

  const financialYearSelects = [
    supplyFinancialYearSelect, demandFinancialYearSelect, billFinancialYearSelect,
    genProjectFinancialYearSelect, miscFinancialYearSelect, trainingFinancialYearSelect
  ];

  financialYears.forEach((year) => {
    financialYearSelects.forEach(select => {
      if (select) {
        const option = document.createElement("option");
        option.value = year;
        option.textContent = year;
        if (year === currentFinancialYear) {
          option.selected = true;
        }
        select.appendChild(option);
      }
    });
  });

  const changePasswordContainer = document.getElementById("change-password-container");
  const changePasswordBtn = document.getElementById("change-password-btn");
  const backToLoginBtn = document.getElementById("back-to-login-btn");
  const verifyAnswerBtn = document.getElementById("verify-answer-btn");
  const updatePasswordBtn = document.getElementById("update-password-btn");
  const securityQuestionForm = document.getElementById("security-question-form");
  const newPasswordForm = document.getElementById("new-password-form");

  // Login form handling
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        currentUser = result.user; // Store user info
        
        // Set current financial year
        currentFinancialYear = getCurrentFinancialYear();
        
        // Update all financial year selectors to current year
        const allFinancialYearSelects = [
          supplyFinancialYearSelect, demandFinancialYearSelect, billFinancialYearSelect,
          genProjectFinancialYearSelect, miscFinancialYearSelect, trainingFinancialYearSelect
        ];
        allFinancialYearSelects.forEach(select => {
          if (select) {
            select.value = currentFinancialYear;
          }
        });
        
        loginContainer.classList.add("hidden");
        dashboard.classList.remove("hidden");
        updateUIForUserRole(); // Update UI based on role
        startSessionTimer(); // Start session management
        addActivityListeners(); // Add activity listeners

        // Initialize WebSocket connection
        initializeWebSocket();

        // Start periodic session check
        sessionCheckInterval = setInterval(checkSession, 5 * 60 * 1000); // Check every 5 minutes

        showRegister("supply");
      } else {
        alert(result.message || "Invalid credentials");
      }
    } catch (error) {
      console.error("Login error:", error);
      alert("Login failed. Please try again.");
    }
  });

  changePasswordBtn.addEventListener("click", () => {
    loginContainer.classList.add("hidden");
    changePasswordContainer.classList.remove("hidden");
    securityQuestionForm.classList.remove("hidden");
    newPasswordForm.classList.add("hidden");
    document.getElementById("security-answer").value = "";
    document.getElementById("new-password").value = "";
    document.getElementById("confirm-password").value = "";
  });

  backToLoginBtn.addEventListener("click", () => {
    changePasswordContainer.classList.add("hidden");
    loginContainer.classList.remove("hidden");
  });

  verifyAnswerBtn.addEventListener("click", async () => {
    const answer = document.getElementById("security-answer").value.toLowerCase().trim();

    try {
      const response = await fetch("/api/verify-security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", answer }), // Assuming admin for password reset
      });

      const result = await response.json();

      if (response.ok && result.success) {
        securityQuestionForm.classList.add("hidden");
        newPasswordForm.classList.remove("hidden");
      } else {
        alert(result.message || "Incorrect answer. Please try again.");
        document.getElementById("security-answer").value = "";
      }
    } catch (error) {
      console.error("Security verification error:", error);
      alert("Verification failed. Please try again.");
    }
  });

  updatePasswordBtn.addEventListener("click", async () => {
    const newPassword = document.getElementById("new-password").value;
    const confirmPassword = document.getElementById("confirm-password").value;

    if (!newPassword || !confirmPassword) {
      alert("Please fill in both password fields.");
      return;
    }

    if (newPassword !== confirmPassword) {
      alert("Passwords do not match. Please try again.");
      return;
    }

    if (newPassword.length < 6) {
      alert("Password must be at least 6 characters long.");
      return;
    }

    try {
      const response = await fetch("/api/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", newPassword }), // Assuming admin for password reset
      });

      const result = await response.json();

      if (response.ok && result.success) {
        alert(result.message || "Password changed successfully");
        changePasswordContainer.classList.add("hidden");
        loginContainer.classList.remove("hidden");
        document.getElementById("new-password").value = "";
        document.getElementById("confirm-password").value = "";
      } else {
        alert(result.message || "Failed to change password");
      }
    } catch (error) {
      console.error("Password change error:", error);
      alert("Password change failed. Please try again.");
    }
  });

  document.getElementById("logout").addEventListener("click", () => {
    logout();
  });

  // Dark mode toggle - only add listener if user is logged in
  const darkModeToggle = document.getElementById("dark-mode-toggle");
  if (darkModeToggle) {
    darkModeToggle.addEventListener("click", () => {
      toggleDarkMode();
    });
  }

  // Dashboard event listeners
  document.getElementById("dashboard-btn").addEventListener("click", () => {
    showDashboard();
  });

  document.getElementById("close-dashboard").addEventListener("click", () => {
    hideDashboard();
  });

  // Dashboard tab navigation
  document.getElementById("overview-tab").addEventListener("click", () => switchDashboardTab("overview"));
  document.getElementById("reports-tab").addEventListener("click", () => switchDashboardTab("reports"));
  document.getElementById("comparison-tab").addEventListener("click", () => switchDashboardTab("comparison"));
  document.getElementById("visualization-tab").addEventListener("click", () => switchDashboardTab("visualization"));

  // Report generation
  document.getElementById("generate-report").addEventListener("click", generateReport);
  document.getElementById("print-report").addEventListener("click", printReport);
  document.getElementById("download-pdf").addEventListener("click", downloadPDF);

  // Comparison functionality
  document.getElementById("compare-years").addEventListener("click", compareYears);

  // Advanced visualization
  document.getElementById("update-visualization").addEventListener("click", updateAdvancedVisualization);

  // Check for existing session on page load
  checkSession().then(() => {
    fetch("/api/session")
      .then(response => response.json())
      .then(result => {
        if (result.success && result.user) {
          currentUser = result.user;
          
          // Set current financial year
          currentFinancialYear = getCurrentFinancialYear();
          
          // Update all financial year selectors to current year
          const allFinancialYearSelects = [
            supplyFinancialYearSelect, demandFinancialYearSelect, billFinancialYearSelect,
            genProjectFinancialYearSelect, miscFinancialYearSelect, trainingFinancialYearSelect
          ];
          allFinancialYearSelects.forEach(select => {
            if (select) {
              select.value = currentFinancialYear;
            }
          });
          
          loginContainer.classList.add("hidden");
          dashboard.classList.remove("hidden");
          updateUIForUserRole();
          startSessionTimer();
          addActivityListeners();
          sessionCheckInterval = setInterval(checkSession, 5 * 60 * 1000);
          showRegister("supply");
        }
      })
      .catch(() => {
        // Session not valid, stay on login page
      });
  });

  document.getElementById("supply-register-btn").addEventListener("click", () => showRegister("supply"));
  document.getElementById("demand-register-btn").addEventListener("click", () => showRegister("demand"));
  document.getElementById("bill-register-btn").addEventListener("click", () => showRegister("bill"));
  document.getElementById("sanction-register-btn").addEventListener("click", () => showRegister("sanction"));

  // Sanction code register sub-section navigation
  if (document.getElementById("gen-project-btn")) {
    document.getElementById("gen-project-btn").addEventListener("click", () => showSanctionSection("gen-project"));
    document.getElementById("misc-btn").addEventListener("click", () => showSanctionSection("misc"));
    document.getElementById("training-btn").addEventListener("click", () => showSanctionSection("training"));
  }

  function showSanctionSection(type) {
    document.querySelectorAll(".sanction-section").forEach(section => section.classList.add("hidden"));
    document.querySelectorAll("#gen-project-btn, #misc-btn, #training-btn").forEach(btn => {
      btn.classList.remove("bg-blue-600", "text-white");
      btn.classList.add("bg-gray-200", "hover:bg-gray-300");
    });

    document.getElementById(`${type}-btn`).classList.remove("bg-gray-200", "hover:bg-gray-300");
    document.getElementById(`${type}-btn`).classList.add("bg-blue-600", "text-white");
    document.getElementById(`${type}-section`).classList.remove("hidden");
    loadSanctionData(type);
  }

  function showRegister(type) {
    // Leave current room before switching
    leaveDataRoom();

    currentType = type;

    supplyRegister.classList.add("hidden");
    demandRegister.classList.add("hidden");
    billRegister.classList.add("hidden");
    sanctionRegister.classList.add("hidden");

    document.querySelectorAll("#supply-register-btn, #demand-register-btn, #bill-register-btn, #sanction-register-btn").forEach(btn => {
      btn.classList.remove("bg-blue-600", "text-white");
      btn.classList.add("bg-gray-200", "hover:bg-gray-300");
    });

    document.getElementById(`${type}-register-btn`).classList.remove("bg-gray-200", "hover:bg-gray-300");
    document.getElementById(`${type}-register-btn`).classList.add("bg-blue-600", "text-white");
    document.getElementById(`${type}-register`).classList.remove("hidden");

    // Join new room for real-time updates
    joinDataRoom();

    if (type === "sanction") {
      showSanctionSection("gen-project");
    } else {
      loadData(type);
    }
  }

  async function loadData(type) {
    const financialYearSelect = type === "supply" ? supplyFinancialYearSelect
      : type === "demand" ? demandFinancialYearSelect : billFinancialYearSelect;
    const year = financialYearSelect.value;
    try {
      const response = await fetch(`/api/${type}-orders?year=${year}`);
      const data = await response.json();
      renderTable(type, data);
      if (type === "supply") checkDeliveryAlerts(data);
      populateFilterDropdowns(type, data);
    } catch (error) {
      console.error(`Error loading ${type} data:`, error);
    }
  }

  async function loadSanctionData(type) {
    const financialYearSelect = type === "gen-project" ? genProjectFinancialYearSelect
      : type === "misc" ? miscFinancialYearSelect : trainingFinancialYearSelect;
    const year = financialYearSelect.value;
    try {
      const response = await fetch(`/api/sanction-${type}?year=${year}`);
      const data = await response.json();
      renderSanctionTable(type, data);
    } catch (error) {
      console.error(`Error loading sanction ${type} data:`, error);
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toISOString().split("T")[0];
  }

  function getLatestDate(row) {
    const dates = [row.revised_date3, row.revised_date2, row.revised_date1, row.original_date]
      .filter((date) => date)
      .map((date) => new Date(date));
    return dates.length ? new Date(Math.max(...dates)) : null;
  }

  function checkDeliveryAlerts(data) {
    alertContainer.innerHTML = "";
    const today = new Date();
    data.forEach((row) => {
      if (row.delivery_done === "No") {
        const latestDate = getLatestDate(row);
        if (latestDate && latestDate < today) {
          const alertDiv = document.createElement("div");
          alertDiv.className = "bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-4";
          alertDiv.innerHTML = `Delivery overdue for Supply Order No: ${row.supply_order_no_date} (Latest Date: ${formatDate(latestDate)})`;
          alertContainer.appendChild(alertDiv);
        }
      }
    });
  }

  function renderTable(type, data) {
    const tableBody = type === "supply" ? supplyTableBody
      : type === "demand" ? demandTableBody : billTableBody;
    tableBody.innerHTML = "";

    data.forEach((row, index) => {
      const tr = document.createElement("tr");
      tr.dataset.id = row.id;
      tr.className = "border-b";

      if (type === "supply") {
        tr.innerHTML = `
          <td class="p-3"><span class="serial-no">${row.serial_no}</span></td>
          <td class="p-3">${row.supply_order_no_date}</td>
          <td class="p-3">${row.firm_name}</td>
          <td class="p-3">${row.nomenclature}</td>
          <td class="p-3">${row.quantity}</td>
          <td class="p-3">${formatDate(row.original_date)}</td>
          <td class="p-3">${formatDate(row.revised_date1)}</td>
          <td class="p-3">${formatDate(row.revised_date2)}</td>
          <td class="p-3">${formatDate(row.revised_date3)}</td>
          <td class="p-3">${row.build_up}</td>
          <td class="p-3">${row.maint}</td>
          <td class="p-3">${row.misc}</td>
          <td class="p-3">${row.project_no_pdc}</td>
          <td class="p-3">${row.p_np || ""}</td>
          <td class="p-3">${row.expenditure_head || ""}</td>
          <td class="p-3">${row.rev_cap || ""}</td>
          <td class="p-3">${formatDate(row.actual_delivery_date)}</td>
          <td class="p-3">${row.procurement_mode}</td>
          <td class="p-3">${row.delivery_done}</td>
          <td class="p-3">${row.remarks}</td>
          <td class="p-3">
            ${currentUser && currentUser.role !== 'viewer' ? `
            <button onclick="editRow('${type}', ${row.id}, this)" class="bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700 transition">Edit</button>
            <button onclick="deleteRow('${type}', ${row.id})" class="bg-red-600 text-white px-3 py-1 rounded-lg hover:bg-red-700 transition ml-2">Delete</button>
            ` : '<span class="text-gray-500">View Only</span>'}
          </td>
          <td class="p-3 arrange-buttons">
            <button onclick="moveRow('${type}', ${row.id}, 'up')" ${index === 0 ? "disabled" : ""} class="bg-gray-600 text-white px-3 py-1 rounded-lg hover:bg-gray-700 transition">↑</button>
            <button onclick="moveRow('${type}', ${row.id}, 'down')" ${index === data.length - 1 ? "disabled" : ""} class="bg-gray-600 text-white px-3 py-1 rounded-lg hover:bg-gray-700 transition ml-2">↓</button>
          </td>
        `;
      } else if (type === "demand") {
        tr.innerHTML = `
          <td class="p-3">${row.serial_no}</td>
          <td class="p-3">${row.group_demand_no || ""}</td>
          <td class="p-3">${formatDate(row.demand_date)}</td>
          <td class="p-3">${row.mmg_control_no || ""}</td>
          <td class="p-3">${formatDate(row.control_date)}</td>
          <td class="p-3">${row.nomenclature}</td>
          <td class="p-3">${row.quantity}</td>
          <td class="p-3">${row.expenditure_head}</td>
          <td class="p-3">${row.code_head || ""}</td>
          <td class="p-3">${row.rev_cap}</td>
          <td class="p-3">${row.procurement_mode}</td>
          <td class="p-3">${row.est_cost}</td>
          <td class="p-3">${row.imms_control_no}</td>
          <td class="p-3">${row.remarks}</td>
          <td class="p-3">
            ${currentUser && currentUser.role !== 'viewer' ? `
            <button onclick="editRow('${type}', ${row.id}, this)" class="bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700 transition">Edit</button>
            <button onclick="deleteRow('${type}', ${row.id})" class="bg-red-600 text-white px-3 py-1 rounded-lg hover:bg-red-700 transition ml-2">Delete</button>
            ` : '<span class="text-gray-500">View Only</span>'}
          </td>
          <td class="p-3 arrange-buttons">
            <button onclick="moveRow('${type}', ${row.id}, 'up')" ${index === 0 ? "disabled" : ""} class="bg-gray-600 text-white px-3 py-1 rounded-lg hover:bg-gray-700 transition">↑</button>
            <button onclick="moveRow('${type}', ${row.id}, 'down')" ${index === data.length - 1 ? "disabled" : ""} class="bg-gray-600 text-white px-3 py-1 rounded-lg hover:bg-gray-700 transition ml-2">↓</button>
          </td>
        `;
      } else { // bill
        tr.innerHTML = `
          <td class="p-3">${row.serial_no}</td>
          <td class="p-3">${formatDate(row.bill_control_date)}</td>
          <td class="p-3">${row.firm_name}</td>
          <td class="p-3">${row.supply_order_no}</td>
          <td class="p-3">${formatDate(row.so_date)}</td>
          <td class="p-3">${row.project_no}</td>
          <td class="p-3">${row.build_up}</td>
          <td class="p-3">${row.maintenance}</td>
          <td class="p-3">${row.project_less_2cr}</td>
          <td class="p-3">${row.project_more_2cr}</td>
          <td class="p-3">${row.procurement_mode}</td>
          <td class="p-3">${row.rev_cap}</td>
          <td class="p-3">${row.date_amount_passed}</td>
          <td class="p-3">${row.ld_amount}</td>
          <td class="p-3">${row.remarks}</td>
          <td class="p-3">
            ${currentUser && currentUser.role !== 'viewer' ? `
            <button onclick="editRow('${type}', ${row.id}, this)" class="bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700 transition">Edit</button>
            <button onclick="deleteRow('${type}', ${row.id})" class="bg-red-600 text-white px-3 py-1 rounded-lg hover:bg-red-700 transition ml-2">Delete</button>
            ` : '<span class="text-gray-500">View Only</span>'}
          </td>
          <td class="p-3 arrange-buttons">
            <button onclick="moveRow('${type}', ${row.id}, 'up')" ${index === 0 ? "disabled" : ""} class="bg-gray-600 text-white px-3 py-1 rounded-lg hover:bg-gray-700 transition">↑</button>
            <button onclick="moveRow('${type}', ${row.id}, 'down')" ${index === data.length - 1 ? "disabled" : ""} class="bg-gray-600 text-white px-3 py-1 rounded-lg hover:bg-gray-700 transition ml-2">↓</button>
          </td>
        `;
      }
      tableBody.appendChild(tr);
    });
  }

  function renderSanctionTable(type, data) {
    const tableBody = type === "gen-project" ? genProjectTableBody
      : type === "misc" ? miscTableBody : trainingTableBody;
    tableBody.innerHTML = "";

    data.forEach((row, index) => {
      const tr = document.createElement("tr");
      tr.dataset.id = row.id;
      tr.className = "border-b";
      tr.innerHTML = `
        <td class="p-3">${row.serial_no}</td>
        <td class="p-3">${formatDate(row.date)}</td>
        <td class="p-3">${row.file_no}</td>
        <td class="p-3">${row.sanction_code}</td>
        <td class="p-3">${row.code}</td>
        <td class="p-3">${row.np_proj}</td>
        <td class="p-3">${row.power}</td>
        <td class="p-3">${row.code_head}</td>
        <td class="p-3">${row.rev_cap}</td>
        <td class="p-3">${row.amount}</td>
        <td class="p-3">${row.uo_no}</td>
        <td class="p-3">${formatDate(row.uo_date)}</td>
        <td class="p-3">${row.amendment}</td>
        <td class="p-3">
          ${currentUser && currentUser.role !== 'viewer' ? `
          <button onclick="editSanctionRow('${type}', ${row.id}, this)" class="bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700 transition">Edit</button>
          <button onclick="deleteSanctionRow('${type}', ${row.id})" class="bg-red-600 text-white px-3 py-1 rounded-lg hover:bg-red-700 transition ml-2">Delete</button>
          ` : '<span class="text-gray-500">View Only</span>'}
        </td>
        <td class="p-3 arrange-buttons">
          <button onclick="moveSanctionRow('${type}', ${row.id}, 'up')" ${index === 0 ? "disabled" : ""} class="bg-gray-600 text-white px-3 py-1 rounded-lg hover:bg-gray-700 transition">↑</button>
          <button onclick="moveSanctionRow('${type}', ${row.id}, 'down')" ${index === data.length - 1 ? "disabled" : ""} class="bg-gray-600 text-white px-3 py-1 rounded-lg hover:bg-gray-700 transition ml-2">↓</button>
        </td>
      `;
      tableBody.appendChild(tr);
    });
  }

  window.addRow = async (type) => {
    // Check if user has permission to add
    if (currentUser && currentUser.role === 'viewer') {
      alert('You do not have permission to add records.');
      return;
    }

    const financialYearSelect = type === "supply" ? supplyFinancialYearSelect
      : type === "demand" ? demandFinancialYearSelect : billFinancialYearSelect;
    const tableBody = type === "supply" ? supplyTableBody
      : type === "demand" ? demandTableBody : billTableBody;
    const maxSerialNo = await getMaxSerialNo(type);

    const newRow = createNewRowData(type, maxSerialNo + 1, financialYearSelect.value);
    const tr = createNewRowElement(type, newRow);

    // Insert at the top of the table
    if (tableBody.firstChild) {
      tableBody.insertBefore(tr, tableBody.firstChild);
    } else {
      tableBody.appendChild(tr);
    }
  };

  window.addSanctionRow = async (type) => {
    // Check if user has permission to add
    if (currentUser && currentUser.role === 'viewer') {
      alert('You do not have permission to add records.');
      return;
    }

    const financialYearSelect = type === "gen-project" ? genProjectFinancialYearSelect
      : type === "misc" ? miscFinancialYearSelect : trainingFinancialYearSelect;
    const tableBody = type === "gen-project" ? genProjectTableBody
      : type === "misc" ? miscTableBody : trainingTableBody;
    const maxSerialNo = await getSanctionMaxSerialNo(type);

    const newRow = {
      serial_no: maxSerialNo + 1,
      date: "",
      file_no: "",
      sanction_code: "",
      code: "",
      np_proj: "",
      power: "",
      code_head: "",
      rev_cap: "R",
      amount: "",
      uo_no: "",
      uo_date: "",
      amendment: "",
      financial_year: financialYearSelect.value,
    };

    const tr = createSanctionRowElement(type, newRow);

    // Insert at the top of the table
    if (tableBody.firstChild) {
      tableBody.insertBefore(tr, tableBody.firstChild);
    } else {
      tableBody.appendChild(tr);
    }
  };

  function createNewRowData(type, serialNo, financialYear) {
    if (type === "supply") {
      return {
        serial_no: serialNo,
        supply_order_no_date: `ADRDE/AS-QMS/MMG/PM/8${String(serialNo).padStart(3, "0")}`,
        firm_name: "",
        nomenclature: "",
        quantity: "",
        original_date: "",
        revised_date1: "",
        revised_date2: "",
        revised_date3: "",
        build_up: "",
        maint: "",
        misc: "",
        project_no_pdc: "",
        p_np: "",
        expenditure_head: "",
        rev_cap: "R",
        actual_delivery_date: "",
        procurement_mode: "",
        delivery_done: "No",
        remarks: "",
        financial_year: financialYear,
      };
    } else if (type === "demand") {
      return {
        serial_no: serialNo,
        group_demand_no: "",
        demand_date: "",
        mmg_control_no: `ADRDE/AS-QMS/MMG/PM/8/${String(serialNo).padStart(3, "0")}`,
        control_date: "",
        nomenclature: "",
        quantity: "",
        expenditure_head: "",
        code_head: "",
        rev_cap: "R",
        procurement_mode: "",
        est_cost: "",
        imms_control_no: "",
        remarks: "",
        financial_year: financialYear,
      };
    } else { // bill
      return {
        serial_no: serialNo,
        bill_control_date: "",
        firm_name: "",
        supply_order_no: `ADRDE/AS-QMS/MMG/PM/8/${String(serialNo).padStart(3, "0")}`,
        so_date: "",
        project_no: "",
        build_up: "",
        maintenance: "",
        project_less_2cr: "",
        project_more_2cr: "",
        procurement_mode: "",
        rev_cap: "R",
        date_amount_passed: "",
        ld_amount: "",
        remarks: "",
        financial_year: financialYear,
      };
    }
  }

  function createNewRowElement(type, newRow) {
    const tr = document.createElement("tr");
    tr.className = "border-b";

    if (type === "supply") {
      tr.innerHTML = `
        <td class="p-3"><input type="number" min="1" value="${newRow.serial_no}" class="serial-no-input p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${newRow.supply_order_no_date}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${newRow.firm_name}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${newRow.nomenclature}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${newRow.quantity}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="date" value="${newRow.original_date}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="date" value="${newRow.revised_date1}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="date" value="${newRow.revised_date2}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="date" value="${newRow.revised_date3}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${newRow.build_up}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${newRow.maint}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${newRow.misc}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${newRow.project_no_pdc}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${newRow.p_np}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${newRow.expenditure_head}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3">
          <select class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="R" ${newRow.rev_cap === "R" ? "selected" : ""}>R</option>
            <option value="C" ${newRow.rev_cap === "C" ? "selected" : ""}>C</option>
          </select>
        </td>
        <td class="p-3"><input type="date" value="${newRow.actual_delivery_date}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${newRow.procurement_mode}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3">
          <select class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="No" ${newRow.delivery_done === "No" ? "selected" : ""}>No</option>
            <option value="Yes" ${newRow.delivery_done === "Yes" ? "selected" : ""}>Yes</option>
          </select>
        </td>
        <td class="p-3"><input type="text" value="${newRow.remarks}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3">
          <button onclick="saveRow('${type}', null, this)" class="bg-green-600 text-white px-3 py-1 rounded-lg hover:bg-green-700 transition">Save</button>
          <button onclick="cancelEdit(this)" class="bg-gray-600 text-white px-3 py-1 rounded-lg hover:bg-gray-700 transition ml-2">Cancel</button>
        </td>
        <td class="p-3 arrange-buttons"></td>
      `;
    } else if (type === "demand") {
      tr.innerHTML = `
        <td class="p-3"><input type="number" min="1" value="${newRow.serial_no}" class="serial-no-input p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${newRow.group_demand_no}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="date" value="${newRow.demand_date}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${newRow.mmg_control_no}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="date" value="${newRow.control_date}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${newRow.nomenclature}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${newRow.quantity}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${newRow.expenditure_head}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${newRow.code_head}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3">
          <select class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="R" ${newRow.rev_cap === "R" ? "selected" : ""}>R</option>
            <option value="C" ${newRow.rev_cap === "C" ? "selected" : ""}>C</option>
          </select>
        </td>
        <td class="p-3"><input type="text" value="${newRow.procurement_mode}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="number" step="0.01" value="${newRow.est_cost}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${newRow.imms_control_no}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${newRow.remarks}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3">
          <button onclick="saveRow('${type}', null, this)" class="bg-green-600 text-white px-3 py-1 rounded-lg hover:bg-green-700 transition">Save</button>
          <button onclick="cancelEdit(this)" class="bg-gray-600 text-white px-3 py-1 rounded-lg hover:bg-gray-700 transition ml-2">Cancel</button>
        </td>
        <td class="p-3 arrange-buttons"></td>
      `;
    } else { // bill
      tr.innerHTML = `
        <td class="p-3"><input type="number" min="1" value="${newRow.serial_no}" class="serial-no-input p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="date" value="${newRow.bill_control_date}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${newRow.firm_name}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${newRow.supply_order_no}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="date" value="${newRow.so_date}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${newRow.project_no}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${newRow.build_up}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${newRow.maintenance}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${newRow.project_less_2cr}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${newRow.project_more_2cr}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${newRow.procurement_mode}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3">
          <select class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="R" ${newRow.rev_cap === "R" ? "selected" : ""}>R</option>
            <option value="C" ${newRow.rev_cap === "C" ? "selected" : ""}>C</option>
          </select>
        </td>
        <td class="p-3"><input type="text" value="${newRow.date_amount_passed}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${newRow.ld_amount}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${newRow.remarks}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3">
          <button onclick="saveRow('${type}', null, this)" class="bg-green-600 text-white px-3 py-1 rounded-lg hover:bg-green-700 transition">Save</button>
          <button onclick="cancelEdit(this)" class="bg-gray-600 text-white px-3 py-1 rounded-lg hover:bg-gray-700 transition ml-2">Cancel</button>
        </td>
        <td class="p-3 arrange-buttons"></td>
      `;
    }
    return tr;
  }

  function createSanctionRowElement(type, newRow) {
    const tr = document.createElement("tr");
    tr.className = "border-b";
    tr.innerHTML = `
      <td class="p-3"><input type="number" min="1" value="${newRow.serial_no}" class="serial-no-input p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
      <td class="p-3"><input type="date" value="${newRow.date}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
      <td class="p-3"><input type="text" value="${newRow.file_no}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
      <td class="p-3"><input type="text" value="${newRow.sanction_code}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
      <td class="p-3"><input type="text" value="${newRow.code}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
      <td class="p-3"><input type="text" value="${newRow.np_proj}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
      <td class="p-3"><input type="text" value="${newRow.power}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
      <td class="p-3"><input type="text" value="${newRow.code_head}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
      <td class="p-3">
        <select class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="R" ${newRow.rev_cap === "R" ? "selected" : ""}>R</option>
          <option value="C" ${newRow.rev_cap === "C" ? "selected" : ""}>C</option>
        </select>
      </td>
      <td class="p-3"><input type="number" step="0.01" value="${newRow.amount}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
      <td class="p-3"><input type="text" value="${newRow.uo_no}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
      <td class="p-3"><input type="date" value="${formatDate(newRow.uo_date)}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
      <td class="p-3"><input type="text" value="${newRow.amendment}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
      <td class="p-3">
        <button onclick="saveSanctionRow('${type}', null, this)" class="bg-green-600 text-white px-3 py-1 rounded-lg hover:bg-green-700 transition">Save</button>
        <button onclick="cancelEdit(this)" class="bg-gray-600 text-white px-3 py-1 rounded-lg hover:bg-gray-700 transition ml-2">Cancel</button>
      </td>
      <td class="p-3 arrange-buttons"></td>
    `;
    return tr;
  }

  window.editRow = async (type, id, button) => {
    // Check if user has permission to edit
    if (currentUser && currentUser.role === 'viewer') {
      alert('You do not have permission to edit records.');
      return;
    }

    const row = button.closest("tr");
    const cells = row.querySelectorAll("td");

    // Save original content
    row.dataset.originalContent = row.innerHTML;

    const financialYearSelect = type === "supply" ? supplyFinancialYearSelect
      : type === "demand" ? demandFinancialYearSelect : billFinancialYearSelect;

    try {
      const response = await fetch(`/api/${type}-orders/${id}`);
      const data = await response.json();

      if (type === "supply") {
        row.innerHTML = `
          <td class="p-3"><input type="number" min="1" value="${data.serial_no}" class="serial-no-input p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="text" value="${data.supply_order_no_date}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="text" value="${data.firm_name}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="text" value="${data.nomenclature}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="text" value="${data.quantity}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="date" value="${formatDate(data.original_date)}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="date" value="${formatDate(data.revised_date1)}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="date" value="${formatDate(data.revised_date2)}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="date" value="${formatDate(data.revised_date3)}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="text" value="${data.build_up}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="text" value="${data.maint}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="text" value="${data.misc}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="text" value="${data.project_no_pdc}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="text" value="${data.p_np || ""}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="text" value="${data.expenditure_head || ""}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3">
            <select class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="R" ${data.rev_cap === "R" ? "selected" : ""}>R</option>
              <option value="C" ${data.rev_cap === "C" ? "selected" : ""}>C</option>
            </select>
          </td>
          <td class="p-3"><input type="date" value="${formatDate(data.actual_delivery_date)}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="text" value="${data.procurement_mode}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3">
            <select class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="No" ${data.delivery_done === "No" ? "selected" : ""}>No</option>
              <option value="Yes" ${data.delivery_done === "Yes" ? "selected" : ""}>Yes</option>
            </select>
          </td>
          <td class="p-3"><input type="text" value="${data.remarks}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3">
            <button onclick="saveRow('${type}', ${id}, this)" class="bg-green-600 text-white px-3 py-1 rounded-lg hover:bg-green-700 transition">Save</button>
            <button onclick="cancelEdit(this)" class="bg-gray-600 text-white px-3 py-1 rounded-lg hover:bg-gray-700 transition ml-2">Cancel</button>
          </td>
          <td class="p-3 arrange-buttons"></td>
        `;
      } else if (type === "demand") {
        row.innerHTML = `
          <td class="p-3"><input type="number" min="1" value="${data.serial_no}" class="serial-no-input p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="text" value="${data.group_demand_no || ""}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="date" value="${formatDate(data.demand_date)}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="text" value="${data.mmg_control_no || ""}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="date" value="${formatDate(data.control_date)}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="text" value="${data.nomenclature}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="text" value="${data.quantity}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="text" value="${data.expenditure_head}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="text" value="${data.code_head || ""}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3">
            <select class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="R" ${data.rev_cap === "R" ? "selected" : ""}>R</option>
              <option value="C" ${data.rev_cap === "C" ? "selected" : ""}>C</option>
            </select>
          </td>
          <td class="p-3"><input type="text" value="${data.procurement_mode}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="number" step="0.01" value="${data.est_cost}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="text" value="${data.imms_control_no}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="text" value="${data.remarks}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3">
            <button onclick="saveRow('${type}', ${id}, this)" class="bg-green-600 text-white px-3 py-1 rounded-lg hover:bg-green-700 transition">Save</button>
            <button onclick="cancelEdit(this)" class="bg-gray-600 text-white px-3 py-1 rounded-lg hover:bg-gray-700 transition ml-2">Cancel</button>
          </td>
          <td class="p-3 arrange-buttons"></td>
        `;
      } else { // bill
        row.innerHTML = `
          <td class="p-3"><input type="number" min="1" value="${data.serial_no}" class="serial-no-input p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="date" value="${formatDate(data.bill_control_date)}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="text" value="${data.firm_name}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="text" value="${data.supply_order_no}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="date" value="${formatDate(data.so_date)}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="text" value="${data.project_no}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="text" value="${data.build_up}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="text" value="${data.maintenance}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="text" value="${data.project_less_2cr}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="text" value="${data.project_more_2cr}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="text" value="${data.procurement_mode}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3">
            <select class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="R" ${data.rev_cap === "R" ? "selected" : ""}>R</option>
              <option value="C" ${data.rev_cap === "C" ? "selected" : ""}>C</option>
            </select>
          </td>
          <td class="p-3"><input type="text" value="${data.date_amount_passed}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="text" value="${data.ld_amount}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3"><input type="text" value="${data.remarks}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
          <td class="p-3">
            <button onclick="saveRow('${type}', ${id}, this)" class="bg-green-600 text-white px-3 py-1 rounded-lg hover:bg-green-700 transition">Save</button>
            <button onclick="cancelEdit(this)" class="bg-gray-600 text-white px-3 py-1 rounded-lg hover:bg-gray-700 transition ml-2">Cancel</button>
          </td>
          <td class="p-3 arrange-buttons"></td>
        `;
      }
    } catch (error) {
      console.error(`Error fetching ${type} row ${id}:`, error);
    }
  };

  window.saveRow = async (type, id, button) => {
    const row = button.closest("tr");
    const inputs = row.querySelectorAll("input, select");
    const financialYearSelect = type === "supply" ? supplyFinancialYearSelect
      : type === "demand" ? demandFinancialYearSelect : billFinancialYearSelect;

    let data;
    if (type === "supply") {
      data = {
        serial_no: inputs[0].value,
        supply_order_no_date: inputs[1].value,
        firm_name: inputs[2].value,
        nomenclature: inputs[3].value,
        quantity: inputs[4].value,
        original_date: inputs[5].value || null,
        revised_date1: inputs[6].value || null,
        revised_date2: inputs[7].value || null,
        revised_date3: inputs[8].value || null,
        build_up: inputs[9].value,
        maint: inputs[10].value,
        misc: inputs[11].value,
        project_no_pdc: inputs[12].value,
        p_np: inputs[13].value,
        expenditure_head: inputs[14].value,
        rev_cap: inputs[15].value,
        actual_delivery_date: inputs[16].value || null,
        procurement_mode: inputs[17].value,
        delivery_done: inputs[18].value,
        remarks: inputs[19].value,
        financial_year: financialYearSelect.value,
      };
    } else if (type === "demand") {
      data = {
        serial_no: inputs[0].value,
        group_demand_no: inputs[1].value,
        demand_date: inputs[2].value || null,
        mmg_control_no: inputs[3].value,
        control_date: inputs[4].value || null,
        nomenclature: inputs[5].value,
        quantity: inputs[6].value,
        expenditure_head: inputs[7].value,
        code_head: inputs[8].value,
        rev_cap: inputs[9].value,
        procurement_mode: inputs[10].value,
        est_cost: inputs[11].value,
        imms_control_no: inputs[12].value,
        remarks: inputs[13].value,
        financial_year: financialYearSelect.value,
      };
    } else { // bill
      data = {
        serial_no: inputs[0].value,
        bill_control_date: inputs[1].value || null,
        firm_name: inputs[2].value,
        supply_order_no: inputs[3].value,
        so_date: inputs[4].value || null,
        project_no: inputs[5].value,
        build_up: inputs[6].value,
        maintenance: inputs[7].value,
        project_less_2cr: inputs[8].value,
        project_more_2cr: inputs[9].value,
        procurement_mode: inputs[10].value,
        rev_cap: inputs[11].value,
        date_amount_passed: inputs[12].value,
        ld_amount: inputs[13].value,
        remarks: inputs[14].value,
        financial_year: financialYearSelect.value,
      };
    }

    try {
      const method = id ? "PUT" : "POST";
      const url = id ? `/api/${type}-orders/${id}` : `/api/${type}-orders`;
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (response.ok) {
        loadData(type);
      } else {
        alert(`Failed to ${id ? "update" : "add"} row`);
      }
    } catch (error) {
      console.error(`Error saving ${type} row:`, error);
    }
  };

  // Sanction-specific functions
  window.editSanctionRow = async (type, id, button) => {
    // Check if user has permission to edit
    if (currentUser && currentUser.role === 'viewer') {
      alert('You do not have permission to edit records.');
      return;
    }

    const row = button.closest("tr");
    try {
      const response = await fetch(`/api/sanction-${type}/${id}`);
      const data = await response.json();
      row.innerHTML = `
        <td class="p-3"><input type="number" min="1" value="${data.serial_no}" class="serial-no-input p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="date" value="${formatDate(data.date)}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${data.file_no}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${data.sanction_code}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${data.code}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${data.np_proj}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${data.power}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${data.code_head}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3">
          <select class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="R" ${data.rev_cap === "R" ? "selected" : ""}>R</option>
            <option value="C" ${data.rev_cap === "C" ? "selected" : ""}>C</option>
          </select>
        </td>
        <td class="p-3"><input type="number" step="0.01" value="${data.amount}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${data.uo_no}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="date" value="${formatDate(data.uo_date)}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3"><input type="text" value="${data.amendment}" class="p-2 border rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"></td>
        <td class="p-3">
          <button onclick="saveSanctionRow('${type}', ${id}, this)" class="bg-green-600 text-white px-3 py-1 rounded-lg hover:bg-green-700 transition">Save</button>
          <button onclick="cancelEdit(this)" class="bg-gray-600 text-white px-3 py-1 rounded-lg hover:bg-gray-700 transition ml-2">Cancel</button>
        </td>
        <td class="p-3 arrange-buttons"></td>
      `;
    } catch (error) {
      console.error(`Error fetching sanction ${type} row ${id}:`, error);
    }
  };

  window.saveSanctionRow = async (type, id, button) => {
    const row = button.closest("tr");
    const inputs = row.querySelectorAll("input, select");
    const financialYearSelect = type === "gen-project" ? genProjectFinancialYearSelect
      : type === "misc" ? miscFinancialYearSelect : trainingFinancialYearSelect;

    const data = {
      serial_no: inputs[0].value,
      date: inputs[1].value || null,
      file_no: inputs[2].value,
      sanction_code: inputs[3].value,
      code: inputs[4].value,
      np_proj: inputs[5].value,
      power: inputs[6].value,
      code_head: inputs[7].value,
      rev_cap: inputs[8].value,
      amount: inputs[9].value,
      uo_no: inputs[10].value,
      uo_date: inputs[11].value || null,
      amendment: inputs[12].value,
      financial_year: financialYearSelect.value,
    };

    try {
      const method = id ? "PUT" : "POST";
      const url = id ? `/api/sanction-${type}/${id}` : `/api/sanction-${type}`;
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (response.ok) {
        loadSanctionData(type);
      } else {
        alert(`Failed to ${id ? "update" : "add"} sanction row`);
      }
    } catch (error) {
      console.error(`Error saving sanction ${type} row:`, error);
    }
  };

  window.deleteSanctionRow = async (type, id) => {
    // Check if user has permission to delete
    if (currentUser && currentUser.role === 'viewer') {
      alert('You do not have permission to delete records.');
      return;
    }

    if (confirm("Are you sure you want to delete this row?")) {
      try {
        const response = await fetch(`/api/sanction-${type}/${id}`, {
          method: "DELETE",
        });
        if (response.ok) {
          loadSanctionData(type);
        } else {
          alert("Failed to delete row");
        }
      } catch (error) {
        console.error(`Error deleting sanction ${type} row ${id}:`, error);
      }
    }
  };

  window.moveSanctionRow = async (type, id, direction) => {
    const financialYearSelect = type === "gen-project" ? genProjectFinancialYearSelect
      : type === "misc" ? miscFinancialYearSelect : trainingFinancialYearSelect;
    try {
      const response = await fetch(`/api/sanction-${type}/move/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction,
          financial_year: financialYearSelect.value,
        }),
      });
      if (response.ok) {
        loadSanctionData(type);
      } else {
        alert("Failed to move row");
      }
    } catch (error) {
      console.error(`Error moving sanction ${type} row:`, error);
    }
  };

  window.cancelEdit = (button) => {
    const row = button.closest("tr");
    const registerType = row.closest("#supply-table") ? "supply"
      : row.closest("#demand-table") ? "demand"
      : row.closest("#bill-table") ? "bill"
      : row.closest("#gen-project-table") ? "gen-project"
      : row.closest("#misc-table") ? "misc" : "training";

    if (["gen-project", "misc", "training"].includes(registerType)) {
      loadSanctionData(registerType);
    } else {
      loadData(registerType);
    }
  };

  window.deleteRow = async (type, id) => {
    // Check if user has permission to delete
    if (currentUser && currentUser.role === 'viewer') {
      alert('You do not have permission to delete records.');
      return;
    }

    if (confirm("Are you sure you want to delete this row?")) {
      try {
        const response = await fetch(`/api/${type}-orders/${id}`, {
          method: "DELETE",
        });
        if (response.ok) {
          loadData(type);
        } else {
          alert("Failed to delete row");
        }
      } catch (error) {
        console.error(`Error deleting ${type} row ${id}:`, error);
      }
    }
  };

  window.moveRow = async (type, id, direction) => {
    const financialYearSelect = type === "supply" ? supplyFinancialYearSelect
      : type === "demand" ? demandFinancialYearSelect : billFinancialYearSelect;
    try {
      const response = await fetch(`/api/${type}-orders/move/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction,
          financial_year: financialYearSelect.value,
        }),
      });
      if (response.ok) {
        loadData(type);
      } else {
        alert("Failed to move row");
      }
    } catch (error) {
      console.error(`Error moving ${type} row:`, error);
    }
  };

  async function getMaxSerialNo(type) {
    const financialYearSelect = type === "supply" ? supplyFinancialYearSelect
      : type === "demand" ? demandFinancialYearSelect : billFinancialYearSelect;
    const year = financialYearSelect.value;
    try {
      const response = await fetch(`/api/${type}-orders/max-serial?year=${year}`);
      const data = await response.json();
      return data.maxSerialNo || 0;
    } catch (error) {
      console.error(`Error fetching max serial no for ${type}:`, error);
      return 0;
    }
  }

  async function getSanctionMaxSerialNo(type) {
    const financialYearSelect = type === "gen-project" ? genProjectFinancialYearSelect
      : type === "misc" ? miscFinancialYearSelect : trainingFinancialYearSelect;
    const year = financialYearSelect.value;
    try {
      const response = await fetch(`/api/sanction-${type}/max-serial?year=${year}`);
      const data = await response.json();
      return data.maxSerialNo || 0;
    } catch (error) {
      console.error(`Error fetching max serial no for sanction ${type}:`, error);
      return 0;
    }
  }

  function populateFilterDropdowns(type, data) {
    const filterContainer = document.getElementById(`${type}-advanced-filter`);
    if (!filterContainer) return; // Exit if filter container doesn't exist

    const selects = filterContainer.querySelectorAll(".filter-select");
    const fields =
      type === "supply"
        ? [
            "serial_no", "supply_order_no_date", "firm_name", "nomenclature", "quantity",
            "original_date", "revised_date1", "revised_date2", "revised_date3",
            "build_up", "maint", "misc", "project_no_pdc", "p_np", "expenditure_head",
            "rev_cap", "actual_delivery_date", "procurement_mode", "delivery_done", "remarks"
          ]
        : type === "demand"
        ? [
            "serial_no", "group_demand_no", "demand_date", "mmg_control_no", "control_date",
            "nomenclature", "quantity", "expenditure_head", "code_head", "rev_cap",
            "procurement_mode", "est_cost", "imms_control_no", "remarks"
          ]
        : [ // bill
            "serial_no", "bill_control_date", "firm_name", "supply_order_no", "so_date",
            "project_no", "build_up", "maintenance", "project_less_2cr", "project_more_2cr",
            "procurement_mode", "rev_cap", "date_amount_passed", "ld_amount", "remarks"
          ];

    selects.forEach((select, index) => {
      // Ensure we don't try to access fields beyond the available ones
      if (index >= fields.length) return;

      const field = fields[index];
      select.innerHTML = `<option value="">Select ${field.replace(/_/g, " ")}</option>`;

      // Filter out null/undefined values and create unique sorted options
      const uniqueValues = [...new Set(data.map((row) => row[field]).filter((val) => val !== null && val !== undefined))].sort();

      uniqueValues.forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
      });
    });
  }

  window.toggleAdvancedFilter = (type) => {
    const filterDiv = document.getElementById(`${type}-advanced-filter`);
    if (filterDiv) {
      filterDiv.classList.toggle("hidden");
    }
  };

  window.applyFilter = (type) => {
    const financialYearSelect = type === "supply" ? supplyFinancialYearSelect
      : type === "demand" ? demandFinancialYearSelect : billFinancialYearSelect;
    const filterContainer = document.getElementById(`${type}-advanced-filter`);
    if (!filterContainer) return;

    const selects = filterContainer.querySelectorAll(".filter-select");
    const filters = {};
    selects.forEach((select) => {
      if (select.value) {
        filters[select.name] = select.value;
      }
    });

    fetch(`/api/${type}-orders?year=${financialYearSelect.value}`)
      .then((response) => response.json())
      .then((data) => {
        const filteredData = data.filter((row) => {
          return Object.keys(filters).every((key) => {
            // Use loose equality for potentially mixed types or string vs number comparisons
            return row[key] == filters[key];
          });
        });
        renderTable(type, filteredData);
      })
      .catch((error) => console.error(`Error applying ${type} filter:`, error));
  };

  window.resetFilter = (type) => {
    const filterContainer = document.getElementById(`${type}-advanced-filter`);
    if (filterContainer) {
      filterContainer.querySelectorAll(".filter-select").forEach((select) => (select.value = ""));
    }
    loadData(type); // Reload original data
  };

  window.showBackups = async (type) => {
    const backupList = document.getElementById(`${type}-backup-list`);
    const backupFiles = document.getElementById(`${type}-backup-files`);
    if (!backupList || !backupFiles) return; // Exit if elements don't exist

    backupList.classList.toggle("hidden");
    try {
      const response = await fetch(`/api/${type}-backups`);
      const files = await response.json();
      backupFiles.innerHTML = "";
      files.forEach((file) => {
        const li = document.createElement("li");
        li.innerHTML = `<a href="/backups/${type}/${file}" target="_blank" class="text-blue-600 hover:underline">${file}</a>`;
        backupFiles.appendChild(li);
      });
    } catch (error) {
      console.error(`Error fetching ${type} backups:`, error);
    }
  };

  window.showSanctionBackups = async (type) => {
    const backupList = document.getElementById(`${type}-backup-list`);
    const backupFiles = document.getElementById(`${type}-backup-files`);
    if (!backupList || !backupFiles) return; // Exit if elements don't exist

    backupList.classList.toggle("hidden");
    try {
      const response = await fetch(`/api/sanction-${type}-backups`);
      const files = await response.json();
      backupFiles.innerHTML = "";
      files.forEach((file) => {
        const li = document.createElement("li");
        li.innerHTML = `<a href="/backups/sanction-${type}/${file}" target="_blank" class="text-blue-600 hover:underline">${file}</a>`;
        backupFiles.appendChild(li);
      });
    } catch (error) {
      console.error(`Error fetching sanction ${type} backups:`, error);
    }
  };

  window.exportToExcel = (type) => {
    const financialYearSelect = type === "supply" ? supplyFinancialYearSelect
      : type === "demand" ? demandFinancialYearSelect : billFinancialYearSelect;
    fetch(`/api/${type}-orders?year=${financialYearSelect.value}`)
      .then((response) => response.json())
      .then((data) => {
        const formattedData = data.map((row) => ({
          ...row,
          original_date: formatDate(row.original_date),
          revised_date1: formatDate(row.revised_date1),
          revised_date2: formatDate(row.revised_date2),
          revised_date3: formatDate(row.revised_date3),
          actual_delivery_date: formatDate(row.actual_delivery_date),
          demand_date: formatDate(row.demand_date),
          entry_date: formatDate(row.entry_date),
          so_date: formatDate(row.so_date),
        }));
        const worksheet = XLSX.utils.json_to_sheet(formattedData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(
          workbook,
          worksheet,
          `${type.charAt(0).toUpperCase() + type.slice(1)} Orders`
        );
        XLSX.writeFile(
          workbook,
          `${type}_orders_${financialYearSelect.value}.xlsx`
        );
      })
      .catch((error) =>
        console.error(`Error exporting ${type} to Excel:`, error)
      );
  };

  window.exportSanctionToExcel = (section) => {
    try {
      let data = [];
      let headers = [
        "S.No",
        "Date",
        "File No.",
        "Sanction Code",
        "Code",
        "NP(B)/Proj.",
        "Power",
        "Code Head",
        "Rev/Cap",
        "Amount",
        "U.O. No.",
        "U.O. Date",
        "Amendment(if any)"
      ];
      let filename = "";
      let sanctionData = [];
      let currentYear = "";

      if (section === "gen-project") {
        sanctionData = genProjectSanctionData;
        currentYear = currentGenProjectFinancialYear;
        filename = `Gen_Project_Sanction_${currentYear}.xlsx`;
      } else if (section === "misc") {
        sanctionData = miscSanctionData;
        currentYear = currentMiscFinancialYear;
        filename = `Misc_Sanction_${currentYear}.xlsx`;
      } else if (section === "training") {
        sanctionData = trainingSanctionData;
        currentYear = currentTrainingFinancialYear;
        filename = `Training_Sanction_${currentYear}.xlsx`;
      }

      data = sanctionData.map(order => [
        order.serial_no,
        order.date,
        order.file_no,
        order.sanction_code,
        order.code,
        order.np_proj,
        order.power,
        order.code_head,
        order.rev_cap,
        order.amount,
        order.uo_no,
        order.uo_date,
        order.amendment
      ]);

      // Create workbook and worksheet with DRDO header
      const headerInfo = [
        ["DEFENCE RESEARCH AND DEVELOPMENT ORGANISATION"],
        ["MATERIAL MANAGEMENT GROUP"],
        [`SANCTION CODE REGISTER - ${section.toUpperCase()} - ${currentYear}`],
        ["Generated on: " + new Date().toLocaleDateString()],
        [""],
        headers
      ];

      // Create worksheet with header
      const finalWorksheet = XLSX.utils.aoa_to_sheet([...headerInfo, ...data]);

      // Set column widths
      const colWidths = headers.map(() => ({ wch: 15 }));
      finalWorksheet['!cols'] = colWidths;

      // Merge cells for header
      finalWorksheet['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: headers.length - 1 } },
        { s: { r: 3, c: 0 }, e: { r: 3, c: headers.length - 1 } }
      ];

      // Create workbook
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, finalWorksheet, section.charAt(0).toUpperCase() + section.slice(1));

      // Save the file
      XLSX.writeFile(workbook, filename);

      showAlert(`${section.charAt(0).toUpperCase() + section.slice(1)} sanction register exported successfully as ${filename} with DRDO header`, "success");
    } catch (error) {
      console.error("Export error:", error);
      showAlert("Error exporting sanction data", "error");
    }
  };

  // Search event listeners
  if (supplySearchInput) supplySearchInput.addEventListener("input", () => filterTable("supply"));
  if (demandSearchInput) demandSearchInput.addEventListener("input", () => filterTable("demand"));
  if (billSearchInput) billSearchInput.addEventListener("input", () => filterTable("bill"));
  if (genProjectSearchInput) genProjectSearchInput.addEventListener("input", () => filterSanctionTable("gen-project"));
  if (miscSearchInput) miscSearchInput.addEventListener("input", () => filterSanctionTable("misc"));
  if (trainingSearchInput) trainingSearchInput.addEventListener("input", () => filterSanctionTable("training"));

  // Sort event listeners
  if (supplySortSelect) supplySortSelect.addEventListener("change", () => loadData("supply"));
  if (demandSortSelect) demandSortSelect.addEventListener("change", () => loadData("demand"));
  if (billSortSelect) billSortSelect.addEventListener("change", () => loadData("bill"));

  // Financial year change listeners
  if (supplyFinancialYearSelect) supplyFinancialYearSelect.addEventListener("change", () => {
    currentFinancialYear = supplyFinancialYearSelect.value;
    leaveDataRoom();
    joinDataRoom();
    loadData("supply");
  });
  if (demandFinancialYearSelect) demandFinancialYearSelect.addEventListener("change", () => {
    currentFinancialYear = demandFinancialYearSelect.value;
    leaveDataRoom();
    joinDataRoom();
    loadData("demand");
  });
  if (billFinancialYearSelect) billFinancialYearSelect.addEventListener("change", () => {
    currentFinancialYear = billFinancialYearSelect.value;
    leaveDataRoom();
    joinDataRoom();
    loadData("bill");
  });
  if (genProjectFinancialYearSelect) genProjectFinancialYearSelect.addEventListener("change", () => loadSanctionData("gen-project"));
  if (miscFinancialYearSelect) miscFinancialYearSelect.addEventListener("change", () => loadSanctionData("misc"));
  if (trainingFinancialYearSelect) trainingFinancialYearSelect.addEventListener("change", () => loadSanctionData("training"));

  // Import Excel event listeners
  if (supplyImportExcel) supplyImportExcel.addEventListener("change", (event) => handleImportExcel(event, "supply"));
  if (demandImportExcel) demandImportExcel.addEventListener("change", (event) => handleImportExcel(event, "demand"));
  if (billImportExcel) billImportExcel.addEventListener("change", (event) => handleImportExcel(event, "bill"));
  if (genProjectImportExcel) genProjectImportExcel.addEventListener("change", (event) => handleSanctionImportExcel(event, "gen-project"));
  if (miscImportExcel) miscImportExcel.addEventListener("change", (event) => handleSanctionImportExcel(event, "misc"));
  if (trainingImportExcel) trainingImportExcel.addEventListener("change", (event) => handleSanctionImportExcel(event, "training"));

  function handleImportExcel(event, type) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        const financialYearSelect = type === "supply" ? supplyFinancialYearSelect
          : type === "demand" ? demandFinancialYearSelect : billFinancialYearSelect;
        fetch(`/api/${type}-orders/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: jsonData,
            financial_year: financialYearSelect.value,
          }),
        })
          .then((response) => {
            if (response.ok) {
              loadData(type);
              event.target.value = "";
            } else {
              alert("Failed to import Excel file");
            }
          })
          .catch((error) => console.error(`Error importing ${type} Excel:`, error));
      };
      reader.readAsArrayBuffer(file);
    }
  }

  function handleSanctionImportExcel(event, type) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        const financialYearSelect = type === "gen-project" ? genProjectFinancialYearSelect
          : type === "misc" ? miscFinancialYearSelect : trainingFinancialYearSelect;
        fetch(`/api/sanction-${type}/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: jsonData,
            financial_year: financialYearSelect.value,
          }),
        })
          .then((response) => {
            if (response.ok) {
              loadSanctionData(type);
              event.target.value = "";
            } else {
              alert("Failed to import Excel file");
            }
          })
          .catch((error) => console.error(`Error importing sanction ${type} Excel:`, error));
      };
      reader.readAsArrayBuffer(file);
    }
  }

  function filterTable(type) {
    const searchInput = type === "supply" ? supplySearchInput
      : type === "demand" ? demandSearchInput : billSearchInput;
    const tableBody = type === "supply" ? supplyTableBody
      : type === "demand" ? demandTableBody : billTableBody;

    if (!searchInput || !tableBody) return; // Exit if elements don't exist

    const searchTerm = searchInput.value.toLowerCase();
    const rows = tableBody.querySelectorAll("tr");

    rows.forEach((row) => {
      const text = Array.from(row.querySelectorAll("td"))
        .map((cell) => cell.textContent.toLowerCase())
        .join(" ");
      row.style.display = text.includes(searchTerm) ? "" : "none";
    });
  }

  function filterSanctionTable(type) {
    const searchInput = type === "gen-project" ? genProjectSearchInput
      : type === "misc" ? miscSearchInput : trainingSearchInput;
    const tableBody = type === "gen-project" ? genProjectTableBody
      : type === "misc" ? miscTableBody : trainingTableBody;

    if (!searchInput || !tableBody) return; // Exit if elements don't exist

    const searchTerm = searchInput.value.toLowerCase();
    const rows = tableBody.querySelectorAll("tr");

    rows.forEach((row) => {
      const text = Array.from(row.querySelectorAll("td"))
        .map((cell) => cell.textContent.toLowerCase())
        .join(" ");
      row.style.display = text.includes(searchTerm) ? "" : "none";
    });
  }
});

// Function to update UI based on user role
function updateUIForUserRole() {
  const isViewer = currentUser && currentUser.role === 'viewer';
  const isGamer = currentUser && currentUser.role === 'gamer';

  // Hide/show buttons based on role
  const restrictedButtons = document.querySelectorAll('.admin-only');
  restrictedButtons.forEach(button => {
    if (isViewer) {
      button.style.display = 'none';
    } else {
      button.style.display = 'inline-block';
    }
  });

  // Show dark mode toggle after login
  const darkModeToggle = document.getElementById('dark-mode-toggle');
  if (darkModeToggle && currentUser) {
    darkModeToggle.style.display = 'inline-block';
  }

  // Update user info display
  const userInfo = document.getElementById('user-info');
  if (userInfo && currentUser) {
    userInfo.textContent = `${currentUser.username} (${currentUser.role.toUpperCase()})`;
  }

  // Show gaming interface for gamer role
  if (isGamer) {
    showGamingInterface();
    joinGamingRoom();
  } else {
    hideGamingInterface();
  }
}

// Gaming functions
let currentGame = null;
let chessGames = [];

function showGamingInterface() {
  // Hide regular dashboard
  document.getElementById('dashboard').classList.add('hidden');

  // Show gaming interface
  let gamingInterface = document.getElementById('gaming-interface');
  if (!gamingInterface) {
    createGamingInterface();
  } else {
    gamingInterface.classList.remove('hidden');
  }

  loadGames();
}

function hideGamingInterface() {
  const gamingInterface = document.getElementById('gaming-interface');
  if (gamingInterface) {
    gamingInterface.classList.add('hidden');
  }
}

function createGamingInterface() {
  const body = document.body;

  const gamingHTML = `
    <div id="gaming-interface" class="max-w-full mx-auto bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
      <header class="flex justify-between items-center mb-6">
        <h1 class="text-3xl font-bold text-purple-800">🎮 Gaming Hub</h1>
        <div class="flex gap-2">
          <button id="dark-mode-toggle-gaming" class="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition">🌙</button>
          <button id="logout-gaming" class="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition">Logout</button>
        </div>
      </header>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Game List -->
        <div class="lg:col-span-1">
          <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
            <div class="flex justify-between items-center mb-4">
              <h2 class="text-xl font-bold">Chess Games</h2>
              <button id="create-game-btn" class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition">New Game</button>
            </div>
            <div id="games-list" class="space-y-2">
              <p class="text-gray-500">Loading games...</p>
            </div>
          </div>

          <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg mt-4">
            <h3 class="text-lg font-bold mb-2">Arcade Games</h3>
            <div class="grid grid-cols-1 gap-2">
              <button class="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition" onclick="startTypingMaster()">⌨️ Typing Master</button>
              <button class="w-full bg-pink-600 text-white px-4 py-2 rounded-lg hover:bg-pink-700 transition" onclick="startSpaceInvaders()">👾 Space Defense</button>
              <button class="w-full bg-cyan-600 text-white px-4 py-2 rounded-lg hover:bg-cyan-700 transition" onclick="startMemoryGame()">🧠 Memory Match</button>
            </div>
          </div>

          <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg mt-4">
            <h3 class="text-lg font-bold mb-2">Classic Games</h3>
            <div class="grid grid-cols-1 gap-2">
              <button class="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition" onclick="startTicTacToe()">⭕ Tic Tac Toe</button>
              <button class="w-full bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition" onclick="startSnake()">🐍 Snake Game</button>
              <button class="w-full bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition" onclick="startRockPaperScissors()">✂️ Rock Paper Scissors</button>
              <button class="w-full bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition" onclick="startNumberGuess()">🔢 Number Guessing</button>
            </div>
          </div>
        </div>

        <!-- Game Board -->
        <div class="lg:col-span-2">
          <div id="chess-game" class="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg hidden">
            <div class="flex justify-between items-center mb-4">
              <h2 class="text-xl font-bold">Chess Game</h2>
              <div id="game-status" class="text-lg font-semibold"></div>
            </div>
            <div id="chess-board" class="grid grid-cols-8 gap-1 w-96 h-96 mx-auto mb-4"></div>
            <div id="game-info" class="text-center">
              <p id="turn-indicator" class="text-lg font-semibold mb-2"></p>
              <button id="leave-game-btn" class="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition">Leave Game</button>
            </div>
          </div>

          <div id="other-games" class="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
            <h2 class="text-xl font-bold mb-4 text-center">Select a Game to Play</h2>
            <div class="text-center text-gray-500">
              <p>Choose a game from the sidebar to start playing!</p>
              <div class="mt-4">
                <span class="text-6xl">🎮</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  body.insertAdjacentHTML('beforeend', gamingHTML);

  // Add event listeners
  document.getElementById('logout-gaming').addEventListener('click', logout);
  document.getElementById('dark-mode-toggle-gaming').addEventListener('click', toggleDarkMode);
  document.getElementById('create-game-btn').addEventListener('click', createGame);
  document.getElementById('leave-game-btn').addEventListener('click', leaveGame);
}

function joinGamingRoom() {
  if (socket) {
    socket.emit('join-gaming');

    socket.on('game-updated', (data) => {
      loadGames();
      if (currentGame && currentGame.id === data.gameId) {
        currentGame = data.game;
        updateGameInterface();
      }
    });

    socket.on('move-made', (data) => {
      if (currentGame && currentGame.id === data.gameId) {
        currentGame = data.game;
        updateChessBoard();
        updateGameStatus();
      }
    });
  }
}

async function loadGames() {
  try {
    const response = await fetch('/api/chess/games');
    if (response.ok) {
      chessGames = await response.json();
      updateGamesList();
    }
  } catch (error) {
    console.error('Error loading games:', error);
  }
}

function updateGamesList() {
  const gamesList = document.getElementById('games-list');

  if (chessGames.length === 0) {
    gamesList.innerHTML = '<p class="text-gray-500">No active games</p>';
    return;
  }

  gamesList.innerHTML = chessGames.map(game => `
    <div class="bg-white dark:bg-gray-600 p-3 rounded-lg">
      <div class="flex justify-between items-center">
        <div>
          <p class="font-semibold">Game #${game.id.slice(-4)}</p>
          <p class="text-sm text-gray-600 dark:text-gray-300">Players: ${game.players.join(', ')}</p>
          <p class="text-sm text-gray-600 dark:text-gray-300">Status: ${game.status}</p>
        </div>
        <button onclick="joinGame('${game.id}')" class="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 transition text-sm">
          ${game.players.includes(currentUser.username) ? 'Resume' : 'Join'}
        </button>
      </div>
    </div>
  `).join('');
}

async function createGame() {
  try {
    const response = await fetch('/api/chess/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.ok) {
      const result = await response.json();
      currentGame = result.game;
      showChessGame();
      loadGames();
    }
  } catch (error) {
    console.error('Error creating game:', error);
  }
}

async function joinGame(gameId) {
  try {
    const response = await fetch(`/api/chess/join/${gameId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.ok) {
      const result = await response.json();
      currentGame = result.game;
      showChessGame();
    } else {
      const error = await response.json();
      alert(error.message);
    }
  } catch (error) {
    console.error('Error joining game:', error);
  }
}

function showChessGame() {
  document.getElementById('other-games').classList.add('hidden');
  document.getElementById('chess-game').classList.remove('hidden');
  createChessBoard();
  updateGameInterface();
}

function createChessBoard() {
  const board = document.getElementById('chess-board');
  board.innerHTML = '';

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const square = document.createElement('div');
      square.className = `chess-square w-12 h-12 flex items-center justify-center text-2xl cursor-pointer ${
        (row + col) % 2 === 0 ? 'bg-amber-100' : 'bg-amber-800'
      }`;
      square.dataset.row = row;
      square.dataset.col = col;
      square.addEventListener('click', handleSquareClick);

      if (currentGame && currentGame.board[row][col]) {
        square.textContent = getPieceSymbol(currentGame.board[row][col]);
      }

      board.appendChild(square);
    }
  }
}

function getPieceSymbol(piece) {
  const symbols = {
    'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
    'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
  };
  return symbols[piece] || '';
}

let selectedSquare = null;

function handleSquareClick(event) {
  const square = event.target;
  const row = parseInt(square.dataset.row);
  const col = parseInt(square.dataset.col);

  if (selectedSquare) {
    // Make move
    const fromCol = String.fromCharCode(97 + selectedSquare.col);
    const fromRow = (8 - selectedSquare.row).toString();
    const toCol = String.fromCharCode(97 + col);
    const toRow = (8 - row).toString();

    makeMove(fromCol + fromRow, toCol + toRow);

    // Clear selection
    document.querySelectorAll('.chess-square').forEach(sq => sq.classList.remove('bg-yellow-300'));
    selectedSquare = null;
  } else {
    // Select square
    if (currentGame.board[row][col]) {
      selectedSquare = { row, col };
      square.classList.add('bg-yellow-300');
    }
  }
}

async function makeMove(from, to) {
  try {
    const response = await fetch('/api/chess/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameId: currentGame.id,
        from,
        to
      })
    });

    if (response.ok) {
      const result = await response.json();
      currentGame = result.game;
      updateChessBoard();
      updateGameStatus();
    } else {
      const error = await response.json();
      alert(error.message);
    }
  } catch (error) {
    console.error('Error making move:', error);
  }
}

function updateChessBoard() {
  const squares = document.querySelectorAll('.chess-square');
  squares.forEach(square => {
    const row = parseInt(square.dataset.row);
    const col = parseInt(square.dataset.col);
    square.textContent = currentGame.board[row][col] ? getPieceSymbol(currentGame.board[row][col]) : '';
  });
}

function updateGameInterface() {
  updateGameStatus();
  updateChessBoard();
}

function updateGameStatus() {
  const statusEl = document.getElementById('game-status');
  const turnEl = document.getElementById('turn-indicator');

  statusEl.textContent = `Status: ${currentGame.status}`;

  if (currentGame.status === 'playing') {
    const currentPlayer = currentGame.players[currentGame.turn === 'white' ? 0 : 1];
    turnEl.textContent = `${currentGame.turn === 'white' ? 'White' : 'Black'}'s turn (${currentPlayer})`;
  } else if (currentGame.status === 'finished') {
    turnEl.textContent = `Game Over! Winner: ${currentGame.winner}`;
  } else if (currentGame.status === 'draw') {
    turnEl.textContent = 'Game ended in a draw!';
  } else {
    turnEl.textContent = 'Waiting for opponent...';
  }
}

function leaveGame() {
  currentGame = null;
  document.getElementById('chess-game').classList.add('hidden');
  document.getElementById('other-games').classList.remove('hidden');
  loadGames();
}

// Other simple games
function startTicTacToe() {
  document.getElementById('other-games').innerHTML = `
    <h2 class="text-xl font-bold mb-4 text-center">Tic Tac Toe</h2>
    <div id="tic-tac-toe-board" class="grid grid-cols-3 gap-2 w-64 h-64 mx-auto mb-4">
      ${Array.from({length: 9}, (_, i) => `
        <div class="bg-white border-2 border-gray-300 flex items-center justify-center text-4xl font-bold cursor-pointer hover:bg-gray-100"
             onclick="makeTicTacToeMove(${i})"></div>
      `).join('')}
    </div>
    <div class="text-center">
      <p id="tic-tac-toe-status" class="text-lg font-semibold mb-2">Player X's turn</p>
      <button onclick="resetTicTacToe()" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition">Reset Game</button>
    </div>
  `;

  window.ticTacToeBoard = Array(9).fill('');
  window.ticTacToeCurrentPlayer = 'X';
}

function makeTicTacToeMove(index) {
  if (window.ticTacToeBoard[index] === '' && !checkTicTacToeWinner()) {
    window.ticTacToeBoard[index] = window.ticTacToeCurrentPlayer;
    document.querySelectorAll('#tic-tac-toe-board div')[index].textContent = window.ticTacToeCurrentPlayer;

    const winner = checkTicTacToeWinner();
    if (winner) {
      document.getElementById('tic-tac-toe-status').textContent = `Player ${winner} wins!`;
    } else if (window.ticTacToeBoard.every(cell => cell !== '')) {
      document.getElementById('tic-tac-toe-status').textContent = 'It\'s a draw!';
    } else {
      window.ticTacToeCurrentPlayer = window.ticTacToeCurrentPlayer === 'X' ? 'O' : 'X';
      document.getElementById('tic-tac-toe-status').textContent = `Player ${window.ticTacToeCurrentPlayer}'s turn`;
    }
  }
}

function checkTicTacToeWinner() {
  const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  for (const pattern of winPatterns) {
    const [a, b, c] = pattern;
    if (window.ticTacToeBoard[a] && window.ticTacToeBoard[a] === window.ticTacToeBoard[b] && window.ticTacToeBoard[a] === window.ticTacToeBoard[c]) {
      return window.ticTacToeBoard[a];
    }
  }
  return null;
}

function resetTicTacToe() {
  startTicTacToe();
}

function startSnake() {
  document.getElementById('other-games').innerHTML = `
    <h2 class="text-xl font-bold mb-4 text-center">Snake Game</h2>
    <canvas id="snake-canvas" width="400" height="400" class="border-2 border-gray-300 mx-auto block mb-4"></canvas>
    <div class="text-center">
      <p id="snake-score" class="text-lg font-semibold mb-2">Score: 0</p>
      <button onclick="startSnakeGame()" class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition">Start Game</button>
      <p class="text-sm text-gray-600 mt-2">Use arrow keys to control the snake</p>
    </div>
  `;
}

function startSnakeGame() {
  const canvas = document.getElementById('snake-canvas');
  const ctx = canvas.getContext('2d');
  const gridSize = 20;
  const tileCount = canvas.width / gridSize;

  let snake = [{x: 10, y: 10}];
  let food = {x: 15, y: 15};
  let dx = 0;
  let dy = 0;
  let score = 0;

  function drawGame() {
    clearCanvas();
    moveSnake();
    drawSnake();
    drawFood();
    checkCollision();
    updateScore();
  }

  function clearCanvas() {
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function moveSnake() {
    const head = {x: snake[0].x + dx, y: snake[0].y + dy};
    snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {
      score += 10;
      generateFood();
    } else {
      snake.pop();
    }
  }

  function drawSnake() {
    ctx.fillStyle = 'green';
    snake.forEach(segment => {
      ctx.fillRect(segment.x * gridSize, segment.y * gridSize, gridSize - 2, gridSize - 2);
    });
  }

  function drawFood() {
    ctx.fillStyle = 'red';
    ctx.fillRect(food.x * gridSize, food.y * gridSize, gridSize - 2, gridSize - 2);
  }

  function generateFood() {
    food = {
      x: Math.floor(Math.random() * tileCount),
      y: Math.floor(Math.random() * tileCount)
    };
  }

  function checkCollision() {
    const head = snake[0];

    // Wall collision
    if (head.x < 0 || head.x >= tileCount || head.y < 0 || head.y >= tileCount) {
      resetGame();
    }

    // Self collision
    for (let i = 1; i < snake.length; i++) {
      if (head.x === snake[i].x && head.y === snake[i].y) {
        resetGame();
      }
    }
  }

  function updateScore() {
    document.getElementById('snake-score').textContent = `Score: ${score}`;
  }

  function resetGame() {
    snake = [{x: 10, y: 10}];
    dx = 0;
    dy = 0;
    score = 0;
    generateFood();
  }

  document.addEventListener('keydown', changeDirection);

  function changeDirection(e) {
    const LEFT_KEY = 37;
    const RIGHT_KEY = 39;
    const UP_KEY = 38;
    const DOWN_KEY = 40;

    const keyPressed = e.keyCode;
    const goingUp = dy === -1;
    const goingDown = dy === 1;
    const goingRight = dx === 1;
    const goingLeft = dx === -1;

    if (keyPressed === LEFT_KEY && !goingRight) {
      dx = -1;
      dy = 0;
    }
    if (keyPressed === UP_KEY && !goingDown) {
      dx = 0;
      dy = -1;
    }
    if (keyPressed === RIGHT_KEY && !goingLeft) {
      dx = 1;
      dy = 0;
    }
    if (keyPressed === DOWN_KEY && !goingUp) {
      dx = 0;
      dy = 1;
    }
  }

  setInterval(drawGame, 100);
}



function startSpaceInvaders() {
  document.getElementById('other-games').innerHTML = `
    <h2 class="text-xl font-bold mb-4 text-center">👾 Space Defense</h2>
    <canvas id="space-canvas" width="500" height="400" class="border-2 border-gray-300 mx-auto block mb-4 bg-black"></canvas>
    <div class="text-center">
      <p id="space-score" class="text-lg font-semibold mb-2">Score: 0</p>
      <button onclick="startSpaceGame()" class="bg-pink-600 text-white px-4 py-2 rounded-lg hover:bg-pink-700 transition">Start Game</button>
      <p class="text-sm text-gray-600 mt-2">Use A/D to move, SPACE to shoot!</p>
    </div>
  `;
}

function startSpaceGame() {
  const canvas = document.getElementById('space-canvas');
  const ctx = canvas.getContext('2d');

  let player = { x: 225, y: 350, width: 50, height: 30 };
  let bullets = [];
  let enemies = [];
  let score = 0;
  let gameActive = true;

  // Create enemy grid
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 10; col++) {
      enemies.push({
        x: col * 45 + 50,
        y: row * 40 + 50,
        width: 30,
        height: 20,
        alive: true
      });
    }
  }

  function drawPlayer() {
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(player.x, player.y, player.width, player.height);
    // Ship details
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(player.x + 20, player.y - 5, 10, 5);
  }

  function drawBullets() {
    ctx.fillStyle = '#ffff00';
    bullets.forEach(bullet => {
      ctx.fillRect(bullet.x, bullet.y, 3, 10);
    });
  }

  function drawEnemies() {
    enemies.forEach(enemy => {
      if (enemy.alive) {
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
        // Enemy details
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(enemy.x + 5, enemy.y + 5, 5, 5);
        ctx.fillRect(enemy.x + 20, enemy.y + 5, 5, 5);
      }
    });
  }

  function updateGame() {
    if (!gameActive) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Update bullets
    bullets = bullets.filter(bullet => {
      bullet.y -= 5;
      return bullet.y > 0;
    });

    // Check bullet-enemy collisions
    bullets.forEach((bullet, bIndex) => {
      enemies.forEach(enemy => {
        if (enemy.alive &&
            bullet.x < enemy.x + enemy.width &&
            bullet.x + 3 > enemy.x &&
            bullet.y < enemy.y + enemy.height &&
            bullet.y + 10 > enemy.y) {
          enemy.alive = false;
          bullets.splice(bIndex, 1);
          score += 10;
          document.getElementById('space-score').textContent = `Score: ${score}`;
        }
      });
    });

    // Move enemies
    const aliveEnemies = enemies.filter(e => e.alive);
    if (aliveEnemies.length === 0) {
      alert(`Level Complete! Score: ${score}`);
      gameActive = false;
      return;
    }

    // Simple enemy movement
    if (Math.random() < 0.02) {
      aliveEnemies.forEach(enemy => {
        enemy.y += 10;
        if (enemy.y + enemy.height >= player.y) {
          alert(`Game Over! Score: ${score}`);
          gameActive = false;
        }
      });
    }

    drawPlayer();
    drawBullets();
    drawEnemies();

    requestAnimationFrame(updateGame);
  }

  // Controls
  document.addEventListener('keydown', (e) => {
    if (!gameActive) return;

    switch(e.key.toLowerCase()) {
      case 'a':
        if (player.x > 0) player.x -= 10;
        break;
      case 'd':
        if (player.x < canvas.width - player.width) player.x += 10;
        break;
      case ' ':
        bullets.push({
          x: player.x + player.width / 2,
          y: player.y
        });
        e.preventDefault();
        break;
    }
  });

  updateGame();
}

function startMemoryGame() {
  document.getElementById('other-games').innerHTML = `
    <h2 class="text-xl font-bold mb-4 text-center">🧠 Memory Match</h2>
    <div class="text-center mb-4">
      <p class="text-lg mb-2">Moves: <span id="memory-moves">0</span> | Matches: <span id="memory-matches">0</span>/8</p>
      <button onclick="startMemoryRound()" class="bg-cyan-600 text-white px-4 py-2 rounded-lg hover:bg-cyan-700 transition">New Game</button>
    </div>
    <div id="memory-board" class="grid grid-cols-4 gap-2 w-80 h-80 mx-auto"></div>
  `;
  startMemoryRound();
}

function startMemoryRound() {
  const symbols = ['🎯', '🏆', '⭐', '🎪', '🎨', '🎭', '🎪', '🎯', '🏆', '⭐', '🎨', '🎭', '🚀', '🌟', '🚀', '🌟'];
  let flippedCards = [];
  let matches = 0;
  let moves = 0;

  const board = document.getElementById('memory-board');
  board.innerHTML = '';

  // Shuffle symbols
  for (let i = symbols.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [symbols[i], symbols[j]] = [symbols[j], symbols[i]];
  }

  symbols.forEach((symbol, index) => {
    const card = document.createElement('div');
    card.className = 'bg-blue-500 border-2 border-blue-700 rounded-lg flex items-center justify-center text-3xl cursor-pointer hover:bg-blue-400 transition';
    card.style.height = '80px';
    card.dataset.symbol = symbol;
    card.dataset.index = index;
    card.textContent = '?';

    card.onclick = () => flipCard(card);
    board.appendChild(card);
  });

  function flipCard(card) {
    if (flippedCards.length >= 2 || card.classList.contains('flipped')) return;

    card.textContent = card.dataset.symbol;
    card.classList.add('flipped', 'bg-green-400');
    flippedCards.push(card);

    if (flippedCards.length === 2) {
      moves++;
      document.getElementById('memory-moves').textContent = moves;

      setTimeout(() => {
        if (flippedCards[0].dataset.symbol === flippedCards[1].dataset.symbol) {
          flippedCards.forEach(c => {
            c.classList.add('bg-green-600');
            c.onclick = null;
          });
          matches++;
          document.getElementById('memory-matches').textContent = matches;

          if (matches === 8) {
            setTimeout(() => alert(`Congratulations! You won in ${moves} moves!`), 100);
          }
        } else {
          flippedCards.forEach(c => {
            c.textContent = '?';
            c.classList.remove('flipped', 'bg-green-400');
          });
        }
        flippedCards = [];
      }, 1000);
    }
  }

  document.getElementById('memory-moves').textContent = '0';
  document.getElementById('memory-matches').textContent = '0';
}

function startNumberGuess() {
  document.getElementById('other-games').innerHTML = `
    <h2 class="text-xl font-bold mb-4 text-center">🔢 Number Guessing Game</h2>
    <div class="text-center">
      <p class="text-lg mb-4">I'm thinking of a number between 1 and 100!</p>
      <div class="mb-4">
        <input type="number" id="guess-input" class="border-2 border-gray-300 rounded-lg px-4 py-2 mr-2" placeholder="Enter your guess" min="1" max="100">
        <button onclick="makeGuess()" class="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition">Guess</button>
      </div>
      <p id="guess-feedback" class="text-lg font-semibold mb-2"></p>
      <p id="guess-attempts" class="text-md mb-4">Attempts: 0</p>
      <button onclick="startNumberGuess()" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition">New Game</button>
    </div>
  `;

  window.targetNumber = Math.floor(Math.random() * 100) + 1;
  window.attempts = 0;
}

function makeGuess() {
  const input = document.getElementById('guess-input');
  const guess = parseInt(input.value);

  if (!guess || guess < 1 || guess > 100) {
    document.getElementById('guess-feedback').textContent = 'Please enter a number between 1 and 100!';
    return;
  }

  window.attempts++;
  document.getElementById('guess-attempts').textContent = `Attempts: ${window.attempts}`;

  if (guess === window.targetNumber) {
    document.getElementById('guess-feedback').innerHTML = `🎉 Correct! You guessed it in ${window.attempts} attempts!`;
    input.disabled = true;
  } else if (guess < window.targetNumber) {
    document.getElementById('guess-feedback').textContent = '📈 Too low! Try a higher number.';
  } else {
    document.getElementById('guess-feedback').textContent = '📉 Too high! Try a lower number.';
  }

  input.value = '';
}

window.startTypingMaster = function() {
  const typingLessons = [
    {
      title: "Basic Home Row Keys",
      text: "asdf jkl; asdf jkl; fff jjj ddd kkk sss lll aaa ;;; fjfjfj dkdkdk slslsl fjdk fjdk slsl fjdk slsl"
    },
    {
      title: "Top Row Practice",
      text: "qwerty uiop qwerty uiop qqq www eee rrr ttt yyy uuu iii ooo ppp qwer tyui qwer tyui qwerty"
    },
    {
      title: "Bottom Row Practice",
      text: "zxcv bnm, zxcv bnm, zzz xxx ccc vvv bbb nnn mmm ,,, zxcv bnm zxcv bnm zxcvbnm zxcvbnm"
    },
    {
      title: "Numbers Practice",
      text: "1234567890 1234567890 111 222 333 444 555 666 777 888 999 000 12345 67890 123456789"
    },
    {
      title: "Common Words",
      text: "the quick brown fox jumps over the lazy dog the quick brown fox jumps over the lazy dog"
    },
    {
      title: "Simple Sentences",
      text: "I love to type fast. She can type very well. We are learning to type. They practice every day."
    },
    {
      title: "Pangram Practice",
      text: "The five boxing wizards jump quickly. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump!"
    },
    {
      title: "Intermediate Paragraph",
      text: "Typing is an essential skill in today's digital world. With practice and dedication, anyone can improve their typing speed and accuracy. Regular practice sessions help build muscle memory and increase confidence."
    },
    {
      title: "Advanced Text",
      text: "Proficiency in typing requires consistent practice and proper finger placement. The key to becoming an excellent typist is maintaining proper posture, using all fingers, and developing rhythm and flow in your keystrokes."
    },
    {
      title: "Programming Practice",
      text: "function calculateSum(a, b) { return a + b; } const result = calculateSum(10, 20); console.log('Result:', result);"
    }
  ];

  document.getElementById('other-games').innerHTML = `
    <h2 class="text-xl font-bold mb-4 text-center">⌨️ Typing Master</h2>
    <div class="max-w-4xl mx-auto">
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div class="bg-blue-100 p-4 rounded-lg text-center">
          <h3 class="font-semibold text-blue-800">WPM</h3>
          <p id="typing-wpm" class="text-2xl font-bold text-blue-600">0</p>
        </div>
        <div class="bg-green-100 p-4 rounded-lg text-center">
          <h3 class="font-semibold text-green-800">Accuracy</h3>
          <p id="typing-accuracy" class="text-2xl font-bold text-green-600">100%</p>
        </div>
        <div class="bg-purple-100 p-4 rounded-lg text-center">
          <h3 class="font-semibold text-purple-800">Time</h3>
          <p id="typing-time" class="text-2xl font-bold text-purple-600">0s</p>
        </div>
      </div>

      <div class="mb-4">
        <label class="block text-sm font-medium mb-2">Select Lesson:</label>
        <select id="lesson-select" class="w-full p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
          ${typingLessons.map((lesson, index) =>
            `<option value="${index}">${index + 1}. ${lesson.title}</option>`
          ).join('')}
        </select>
      </div>

      <div class="mb-4">
        <div id="text-to-type" class="bg-gray-100 p-4 rounded-lg border-2 border-gray-300 text-lg leading-relaxed min-h-32">
          ${typingLessons[0].text}
        </div>
      </div>

      <div class="mb-4">
        <textarea
          id="typing-input"
          placeholder="Start typing here..."
          class="w-full p-4 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
          rows="6"
          disabled
        ></textarea>
      </div>

      <div class="text-center mb-4">
        <button id="start-typing" onclick="startTypingTest()" class="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition mr-2">Start Typing Test</button>
        <button id="reset-typing" onclick="resetTypingTest()" class="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition">Reset</button>
      </div>

      <div id="typing-results" class="hidden bg-gray-50 p-4 rounded-lg">
        <h3 class="text-lg font-semibold mb-2">Test Results</h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p class="text-sm text-gray-600">Words Per Minute</p>
            <p id="final-wpm" class="text-xl font-bold">0</p>
          </div>
          <div>
            <p class="text-sm text-gray-600">Accuracy</p>
            <p id="final-accuracy" class="text-xl font-bold">100%</p>
          </div>
          <div>
            <p class="text-sm text-gray-600">Characters Per Minute</p>
            <p id="final-cpm" class="text-xl font-bold">0</p>
          </div>
        </div>
        <div class="mt-4">
          <p class="text-sm text-gray-600">Performance Rating</p>
          <p id="performance-rating" class="text-lg font-semibold"></p>
        </div>
      </div>

      <div class="mt-6 text-sm text-gray-600">
        <h4 class="font-semibold mb-2">Typing Tips:</h4>
        <ul class="list-disc pl-5 space-y-1">
          <li>Keep your fingers on the home row (ASDF for left hand, JKL; for right hand)</li>
          <li>Use proper posture: sit up straight and keep feet flat on the floor</li>
          <li>Don't look at the keyboard while typing</li>
          <li>Practice regularly for 15-30 minutes daily</li>
          <li>Focus on accuracy first, speed will come naturally</li>
        </ul>
      </div>
    </div>
  `;

  window.typingLessons = typingLessons;
  window.currentLesson = 0;
  window.typingStartTime = null;
  window.typingTestActive = false;

  // Lesson selector event
  document.getElementById('lesson-select').addEventListener('change', (e) => {
    window.currentLesson = parseInt(e.target.value);
    document.getElementById('text-to-type').innerHTML = typingLessons[window.currentLesson].text;
    resetTypingTest();
  });
}

window.startTypingTest = function() {
  const input = document.getElementById('typing-input');
  const startBtn = document.getElementById('start-typing');
  const resetBtn = document.getElementById('reset-typing');

  input.disabled = false;
  input.focus();
  startBtn.disabled = true;
  startBtn.textContent = 'Test in Progress...';

  window.typingStartTime = Date.now();
  window.typingTestActive = true;

  input.addEventListener('input', updateTypingProgress);

  // Start the timer
  window.typingInterval = setInterval(updateTypingStats, 100);
}

function updateTypingProgress() {
  const input = document.getElementById('typing-input');
  const textToType = document.getElementById('text-to-type');
  const originalText = window.typingLessons[window.currentLesson].text;

  const typedText = input.value;
  const textLength = originalText.length;

  // Create highlighted text
  let highlightedText = '';
  for (let i = 0; i < originalText.length; i++) {
    if (i < typedText.length) {
      if (typedText[i] === originalText[i]) {
        highlightedText += `<span class="bg-green-200">${originalText[i]}</span>`;
      } else {
        highlightedText += `<span class="bg-red-200">${originalText[i]}</span>`;
      }
    } else if (i === typedText.length) {
      highlightedText += `<span class="bg-blue-200 border-l-2 border-blue-500">${originalText[i]}</span>`;
    } else {
      highlightedText += originalText[i];
    }
  }

  textToType.innerHTML = highlightedText;

  // Check if test is complete
  if (typedText.length >= originalText.length) {
    finishTypingTest();
  }
}

function updateTypingStats() {
  if (!window.typingTestActive || !window.typingStartTime) return;

  const input = document.getElementById('typing-input');
  const typedText = input.value;
  const originalText = window.typingLessons[window.currentLesson].text;

  const timeElapsed = (Date.now() - window.typingStartTime) / 1000;
  const wordsTyped = typedText.trim().split(/\s+/).length;
  const wpm = Math.round((wordsTyped / timeElapsed) * 60) || 0;

  // Calculate accuracy
  let correctChars = 0;
  for (let i = 0; i < typedText.length; i++) {
    if (i < originalText.length && typedText[i] === originalText[i]) {
      correctChars++;
    }
  }
  const accuracy = typedText.length > 0 ? Math.round((correctChars / typedText.length) * 100) : 100;

  document.getElementById('typing-wpm').textContent = wpm;
  document.getElementById('typing-accuracy').textContent = accuracy + '%';
  document.getElementById('typing-time').textContent = Math.round(timeElapsed) + 's';
}

function finishTypingTest() {
  window.typingTestActive = false;
  clearInterval(window.typingInterval);

  const input = document.getElementById('typing-input');
  const startBtn = document.getElementById('start-typing');

  input.disabled = true;
  startBtn.disabled = false;
  startBtn.textContent = 'Start Typing Test';

  // Calculate final stats
  const typedText = input.value;
  const originalText = window.typingLessons[window.currentLesson].text;
  const timeElapsed = (Date.now() - window.typingStartTime) / 1000;

  const wordsTyped = typedText.trim().split(/\s+/).length;
  const wpm = Math.round((wordsTyped / timeElapsed) * 60);
  const cpm = Math.round((typedText.length / timeElapsed) * 60);

  let correctChars = 0;
  for (let i = 0; i < Math.min(typedText.length, originalText.length); i++) {
    if (typedText[i] === originalText[i]) {
      correctChars++;
    }
  }
  const accuracy = typedText.length > 0 ? Math.round((correctChars / typedText.length) * 100) : 100;

  // Show results
  document.getElementById('final-wpm').textContent = wpm;
  document.getElementById('final-accuracy').textContent = accuracy + '%';
  document.getElementById('final-cpm').textContent = cpm;

  // Performance rating
  let rating = '';
  if (wpm < 20) rating = '🐢 Beginner - Keep practicing!';
  else if (wpm < 40) rating = '🚶 Intermediate - Good progress!';
  else if (wpm < 60) rating = '🏃 Advanced - Excellent typing!';
  else if (wpm < 80) rating = '🚀 Expert - Outstanding skills!';
  else rating = '⚡ Master Typist - Incredible speed!';

  document.getElementById('performance-rating').textContent = rating;
  document.getElementById('typing-results').classList.remove('hidden');
}

window.resetTypingTest = function() {
  window.typingTestActive = false;
  clearInterval(window.typingInterval);

  const input = document.getElementById('typing-input');
  const startBtn = document.getElementById('start-typing');
  const textToType = document.getElementById('text-to-type');

  input.value = '';
  input.disabled = true;
  startBtn.disabled = false;
  startBtn.textContent = 'Start Typing Test';

  textToType.innerHTML = window.typingLessons[window.currentLesson].text;

  document.getElementById('typing-wpm').textContent = '0';
  document.getElementById('typing-accuracy').textContent = '100%';
  document.getElementById('typing-time').textContent = '0s';
  document.getElementById('typing-results').classList.add('hidden');

  window.typingStartTime = null;
}
// Dark mode functions
function toggleDarkMode() {
  const html = document.documentElement;
  const isDark = html.classList.contains('dark');

  if (isDark) {
    html.classList.remove('dark');
    localStorage.setItem('darkMode', 'false');
    updateDarkModeIcon(false);
  } else {
    html.classList.add('dark');
    localStorage.setItem('darkMode', 'true');
    updateDarkModeIcon(true);
  }
}

function updateDarkModeIcon(isDark) {
  const toggleBtn = document.getElementById('dark-mode-toggle');
  if (toggleBtn) {
    toggleBtn.textContent = isDark ? '☀️' : '🌙';
    toggleBtn.title = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
  }
}

function initializeDarkMode() {
  const savedDarkMode = localStorage.getItem('darkMode');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const shouldUseDark = savedDarkMode === 'true' || (savedDarkMode === null && prefersDark);

  if (shouldUseDark) {
    document.documentElement.classList.add('dark');
    updateDarkModeIcon(true);
  } else {
    updateDarkModeIcon(false);
  }
}

// Logout function
async function logout() {
  // Clear all timers
  clearTimeout(sessionTimeout);
  clearTimeout(warningTimeout);
  clearInterval(sessionCheckInterval);

  // Disconnect WebSocket
  disconnectWebSocket();

  // Call logout API
  try {
    await fetch("/api/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Logout error:", error);
  }

  // Hide dark mode toggle on logout
  const darkModeToggle = document.getElementById('dark-mode-toggle');
  if (darkModeToggle) {
    darkModeToggle.style.display = 'none';
  }

  currentUser = null;
  document.getElementById("dashboard").classList.add("hidden");
  document.getElementById("login-container").classList.remove("hidden");
  document.getElementById("username").value = "";
  document.getElementById("password").value = "";
}

// Dashboard Functions
function showDashboard() {
  document.getElementById("dashboard-modal").classList.remove("hidden");
  populateYearSelectors();
  loadDashboardData();
}

function hideDashboard() {
  document.getElementById("dashboard-modal").classList.add("hidden");
}

function switchDashboardTab(tab) {
  // Update tab buttons
  document.querySelectorAll('[id$="-tab"]').forEach(btn => {
    btn.classList.remove("border-blue-500", "text-blue-600");
    btn.classList.add("border-transparent", "text-gray-500");
  });

  document.getElementById(`${tab}-tab`).classList.remove("border-transparent", "text-gray-500");
  document.getElementById(`${tab}-tab`).classList.add("border-blue-500", "text-blue-600");

  // Hide all content
  document.querySelectorAll('.dashboard-content').forEach(content => {
    content.classList.add("hidden");
  });

  // Show selected content
  document.getElementById(`${tab}-content`).classList.remove("hidden");

  // Load specific data for tab
  if (tab === "overview") {
    loadDashboardData();
  } else if (tab === "comparison") {
    populateComparisonYears();
  }
}

function populateYearSelectors() {
  const reportYearSelect = document.getElementById("report-year");
  reportYearSelect.innerHTML = "";

  financialYears.forEach(year => {
    const option = document.createElement("option");
    option.value = year;
    option.textContent = year;
    if (year === currentFinancialYear) option.selected = true;
    reportYearSelect.appendChild(option);
  });
}

function populateComparisonYears() {
  const year1Select = document.getElementById("compare-year1");
  const year2Select = document.getElementById("compare-year2");

  [year1Select, year2Select].forEach(select => {
    select.innerHTML = "";
    financialYears.forEach(year => {
      const option = document.createElement("option");
      option.value = year;
      option.textContent = year;
      select.appendChild(option);
    });
  });

  year1Select.value = "2023-2024";
  year2Select.value = "2024-2025";
}

async function loadDashboardData() {
  try {
    const [supplyData, demandData, billData] = await Promise.all([
      fetch(`/api/supply-orders?year=${currentFinancialYear}`).then(r => r.json()),
      fetch(`/api/demand-orders?year=${currentFinancialYear}`).then(r => r.json()),
      fetch(`/api/bill-orders?year=${currentFinancialYear}`).then(r => r.json())
    ]);

    updateOverviewStats(supplyData, demandData, billData);
    createDeliveryChart(supplyData);
    createTrendChart(supplyData, demandData, billData);
  } catch (error) {
    console.error("Error loading dashboard data:", error);
  }
}

function updateOverviewStats(supplyData, demandData, billData) {
  const totalSupply = supplyData.length;
  const deliveredOrders = supplyData.filter(order => order.delivery_done === "Yes").length;
  const pendingOrders = totalSupply - deliveredOrders;

  // Calculate total value from bill data
  const totalValue = billData.reduce((sum, bill) => {
    const value = parseFloat(bill.build_up || 0) +
                  parseFloat(bill.maintenance || 0) +
                  parseFloat(bill.project_less_2cr || 0) +
                  parseFloat(bill.project_more_2cr || 0);
    return sum + value;
  }, 0);

  document.getElementById("total-supply").textContent = totalSupply;
  document.getElementById("delivered-orders").textContent = deliveredOrders;
  document.getElementById("pending-orders").textContent = pendingOrders;
  document.getElementById("total-value").textContent = `₹${totalValue.toFixed(2)}L`;
}

function createDeliveryChart(supplyData) {
  const ctx = document.getElementById("deliveryChart").getContext("2d");

  if (deliveryChart) {
    deliveryChart.destroy();
  }

  const delivered = supplyData.filter(order => order.delivery_done === "Yes").length;
  const pending = supplyData.length - delivered;

  deliveryChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Delivered', 'Pending'],
      datasets: [{
        data: [delivered, pending],
        backgroundColor: ['#10B981', '#F59E0B'],
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1,
      plugins: {
        legend: {
          position: 'bottom'
        },
        datalabels: {
          display: true,
          color: 'white',
          font: {
            weight: 'bold',
            size: 14
          },
          formatter: (value, ctx) => {
            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = ((value / total) * 100).toFixed(1);
            return `${value}\n(${percentage}%)`;
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = ((context.parsed / total) * 100).toFixed(1);
              return `${context.label}: ${context.parsed} (${percentage}%)`;
            }
          }
        },
        zoom: {
          zoom: {
            wheel: {
              enabled: true,
            },
            pinch: {
              enabled: true
            },
            mode: 'xy',
          },
          pan: {
            enabled: true,
            mode: 'xy'
          }
        }
      }
    }
  });
}

function createTrendChart(supplyData, demandData, billData) {
  const ctx = document.getElementById("trendChart").getContext("2d");

  if (trendChart) {
    trendChart.destroy();
  }

  // Group data by month
  const monthlyData = {};

  [supplyData, demandData, billData].forEach((data, index) => {
    const type = ['Supply', 'Demand', 'Bill'][index];
    data.forEach(item => {
      const date = item.original_date || item.demand_date || item.bill_control_date;
      if (date) {
        const month = new Date(date).toISOString().slice(0, 7);
        if (!monthlyData[month]) monthlyData[month] = { Supply: 0, Demand: 0, Bill: 0 };
        monthlyData[month][type]++;
      }
    });
  });

  const months = Object.keys(monthlyData).sort();
  const supplyTrend = months.map(month => monthlyData[month].Supply);
  const demandTrend = months.map(month => monthlyData[month].Demand);
  const billTrend = months.map(month => monthlyData[month].Bill);

  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        {
          label: 'Supply Orders',
          data: supplyTrend,
          borderColor: '#3B82F6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.1
        },
        {
          label: 'Demand Orders',
          data: demandTrend,
          borderColor: '#10B981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          tension: 0.1
        },
        {
          label: 'Bill Orders',
          data: billTrend,
          borderColor: '#F59E0B',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          tension: 0.1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1,
      plugins: {
        legend: {
          position: 'bottom'
        },
        datalabels: {
          display: true,
          align: 'top',
          color: function(context) {
            return context.dataset.borderColor;
          },
          font: {
            weight: 'bold',
            size: 10
          },
          formatter: (value) => value > 0 ? value : ''
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: ${context.parsed.y} orders`;
            }
          }
        },
        zoom: {
          zoom: {
            wheel: {
              enabled: true,
            },
            pinch: {
              enabled: true
            },
            mode: 'xy',
          },
          pan: {
            enabled: true,
            mode: 'xy'
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1
          }
        }
      }
    }
  });
}

async function generateReport() {
  const reportType = document.getElementById("report-type").value;
  const reportYear = document.getElementById("report-year").value;
  const reportContent = document.getElementById("report-content");

  try {
    let data = [];
    if (reportType === "all") {
      const [supply, demand, bill] = await Promise.all([
        fetch(`/api/supply-orders?year=${reportYear}`).then(r => r.json()),
        fetch(`/api/demand-orders?year=${reportYear}`).then(r => r.json()),
        fetch(`/api/bill-orders?year=${reportYear}`).then(r => r.json())
      ]);

      reportContent.innerHTML = `
        <div class="print-content">
          <h2 class="text-2xl font-bold mb-4">Comprehensive Report - ${reportYear}</h2>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div class="text-center p-4 bg-blue-50 rounded">
              <h3 class="font-semibold">Supply Orders</h3>
              <p class="text-2xl font-bold text-blue-600">${supply.length}</p>
            </div>
            <div class="text-center p-4 bg-green-50 rounded">
              <h3 class="font-semibold">Demand Orders</h3>
              <p class="text-2xl font-bold text-green-600">${demand.length}</p>
            </div>
            <div class="text-center p-4 bg-yellow-50 rounded">
              <h3 class="font-semibold">Bill Orders</h3>
              <p class="text-2xl font-bold text-yellow-600">${bill.length}</p>
            </div>
          </div>
          <div class="mb-4">
            <h3 class="text-lg font-semibold mb-2">Supply Orders Summary</h3>
            <p>Delivered: ${supply.filter(s => s.delivery_done === "Yes").length}</p>
            <p>Pending: ${supply.filter(s => s.delivery_done === "No").length}</p>
          </div>
        </div>
      `;
    } else {
      const response = await fetch(`/api/${reportType}-orders?year=${reportYear}`);
      data = await response.json();

      reportContent.innerHTML = `
        <div class="print-content">
          <h2 class="text-2xl font-bold mb-4">${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Orders Report - ${reportYear}</h2>
          <p class="mb-4">Total Orders: <strong>${data.length}</strong></p>
          <p class="mb-4">Generated on: <strong>${new Date().toLocaleDateString()}</strong></p>
          <div class="text-sm text-gray-600">
            <p>This report contains ${data.length} ${reportType} orders for the financial year ${reportYear}.</p>
          </div>
        </div>
      `;
    }
  } catch (error) {
    console.error("Error generating report:", error);
    reportContent.innerHTML = '<p class="text-red-500">Error generating report</p>';
  }
}

function printReport() {
  const printContent = document.querySelector('.print-content');
  if (!printContent) {
    alert('Please generate a report first');
    return;
  }

  const printWindow = window.open('', '', 'height=600,width=800');
  printWindow.document.write(`
    <html>
      <head>
        <title>Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h2 { color: #1f2937; }
          h3 { color: #374151; }
          .grid { display: flex; gap: 20px; margin: 20px 0; }
          .text-center { text-align: center; }
          .p-4 { padding: 16px; }
          .bg-blue-50 { background-color: #eff6ff; }
          .bg-green-50 { background-color: #f0fdf4; }
          .bg-yellow-50 { background-color: #fefce8; }
          .rounded { border-radius: 8px; }
          .font-bold { font-weight: bold; }
          .text-2xl { font-size: 1.5rem; }
          .text-blue-600 { color: #2563eb; }
          .text-green-600 { color: #16a34a; }
          .text-yellow-600 { color: #ca8a04; }
        </style>
      </head>
      <body>
        ${printContent.innerHTML}
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.print();
}

function downloadPDF() {
  alert('PDF download functionality would require a PDF generation library. For now, please use the print function.');
}

async function compareYears() {
  const year1 = document.getElementById("compare-year1").value;
  const year2 = document.getElementById("compare-year2").value;

  try {
    const [year1Data, year2Data] = await Promise.all([
      Promise.all([
        fetch(`/api/supply-orders?year=${year1}`).then(r => r.json()),
        fetch(`/api/demand-orders?year=${year1}`).then(r => r.json()),
        fetch(`/api/bill-orders?year=${year1}`).then(r => r.json())
      ]),
      Promise.all([
        fetch(`/api/supply-orders?year=${year2}`).then(r => r.json()),
        fetch(`/api/demand-orders?year=${year2}`).then(r => r.json()),
        fetch(`/api/bill-orders?year=${year2}`).then(r => r.json())
      ])
    ]);

    createComparisonChart(year1, year1Data, year2, year2Data);
    createValueComparisonChart(year1, year1Data[2], year2, year2Data[2]);
  } catch (error) {
    console.error("Error comparing years:", error);
  }
}

function createComparisonChart(year1, year1Data, year2, year2Data) {
  const ctx = document.getElementById("comparisonChart").getContext("2d");

  if (comparisonChart) {
    comparisonChart.destroy();
  }

  comparisonChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Supply Orders', 'Demand Orders', 'Bill Orders'],
      datasets: [
        {
          label: year1,
          data: [year1Data[0].length, year1Data[1].length, year1Data[2].length],
          backgroundColor: '#3B82F6'
        },
        {
          label: year2,
          data: [year2Data[0].length, year2Data[1].length, year2Data[2].length],
          backgroundColor: '#10B981'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1,
      plugins: {
        legend: {
          position: 'bottom'
        },
        datalabels: {
          display: true,
          anchor: 'end',
          align: 'top',
          color: 'black',
          font: {
            weight: 'bold',
            size: 12
          },
          formatter: (value) => value
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: ${context.parsed.y} orders`;
            }
          }
        },
        zoom: {
          zoom: {
            wheel: {
              enabled: true,
            },
            pinch: {
              enabled: true
            },
            mode: 'xy',
          },
          pan: {
            enabled: true,
            mode: 'xy'
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1
          }
        }
      }
    }
  });
}

function createValueComparisonChart(year1, billData1, year2, billData2) {
  const ctx = document.getElementById("valueComparisonChart").getContext("2d");

  if (valueComparisonChart) {
    valueComparisonChart.destroy();
  }

  const calculateValue = (data) => {
    return data.reduce((sum, bill) => {
      return sum + (parseFloat(bill.build_up || 0) +
                   parseFloat(bill.maintenance || 0) +
                   parseFloat(bill.project_less_2cr || 0) +
                   parseFloat(bill.project_more_2cr || 0));
    }, 0);
  };

  valueComparisonChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Total Value (₹L)'],
      datasets: [
        {
          label: year1,
          data: [calculateValue(billData1)],
          backgroundColor: '#3B82F6'
        },
        {
          label: year2,
          data: [calculateValue(billData2)],
          backgroundColor: '#10B981'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1,
      plugins: {
        legend: {
          position: 'bottom'
        },
        datalabels: {
          display: true,
          anchor: 'end',
          align: 'top',
          color: 'black',
          font: {
            weight: 'bold',
            size: 12
          },
          formatter: (value) => `₹${value.toFixed(2)}L`
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: ₹${context.parsed.y.toFixed(2)}L`;
            }
          }
        },
        zoom: {
          zoom: {
            wheel: {
              enabled: true,
            },
            pinch: {
              enabled: true
            },
            mode: 'xy',
          },
          pan: {
            enabled: true,
            mode: 'xy'
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return '₹' + value.toFixed(2) + 'L';
            }
          }
        }
      }
    }
  });
}

async function updateAdvancedVisualization() {
  const vizType = document.getElementById("viz-type").value;
  const vizTitle = document.getElementById("viz-title");

  try {
    const [supplyData, demandData, billData] = await Promise.all([
      fetch(`/api/supply-orders?year=${currentFinancialYear}`).then(r => r.json()),
      fetch(`/api/demand-orders?year=${currentFinancialYear}`).then(r => r.json()),
      fetch(`/api/bill-orders?year=${currentFinancialYear}`).then(r => r.json())
    ]);

    const ctx = document.getElementById("advancedChart").getContext("2d");

    if (advancedChart) {
      advancedChart.destroy();
    }

    switch (vizType) {
      case "procurement":
        createProcurementChart(ctx, supplyData);
        vizTitle.textContent = "Procurement Mode Analysis";
        break;
      case "firm":
        createFirmChart(ctx, supplyData);
        vizTitle.textContent = "Top Firms by Order Count";
        break;
      case "timeline":
        createTimelineChart(ctx, supplyData);
        vizTitle.textContent = "Delivery Timeline Analysis";
        break;
      case "expenditure":
        createExpenditureChart(ctx, demandData);
        vizTitle.textContent = "Expenditure Head Distribution";
        break;
    }
  } catch (error) {
    console.error("Error updating visualization:", error);
  }
}

function createProcurementChart(ctx, data) {
  const procurementModes = {};
  data.forEach(item => {
    const mode = item.procurement_mode || "Unknown";
    procurementModes[mode] = (procurementModes[mode] || 0) + 1;
  });

  advancedChart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: Object.keys(procurementModes),
      datasets: [{
        data: Object.values(procurementModes),
        backgroundColor: [
          '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
          '#8B5CF6', '#06B6D4', '#F97316', '#84CC16'
        ]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1,
      plugins: {
        legend: {
          position: 'bottom'
        },
        datalabels: {
          display: true,
          color: 'white',
          font: {
            weight: 'bold',
            size: 12
          },
          formatter: (value, ctx) => {
            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = ((value / total) * 100).toFixed(1);
            return `${value}\n(${percentage}%)`;
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = ((context.parsed / total) * 100).toFixed(1);
              return `${context.label}: ${context.parsed} orders (${percentage}%)`;
            }
          }
        },
        zoom: {
          zoom: {
            wheel: {
              enabled: true,
            },
            pinch: {
              enabled: true
            },
            mode: 'xy',
          },
          pan: {
            enabled: true,
            mode: 'xy'
          }
        }
      }
    }
  });
}

function createFirmChart(ctx, data) {
  const firmCounts = {};
  data.forEach(item => {
    const firm = item.firm_name || "Unknown";
    firmCounts[firm] = (firmCounts[firm] || 0) + 1;
  });

  const sortedFirms = Object.entries(firmCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10);

  advancedChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sortedFirms.map(([firm]) => firm),
      datasets: [{
        label: 'Order Count',
        data: sortedFirms.map(([,count]) => count),
        backgroundColor: '#3B82F6'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1,
      indexAxis: 'y',
      plugins: {
        legend: {
          display: false
        },
        datalabels: {
          display: true,
          anchor: 'end',
          align: 'right',
          color: 'black',
          font: {
            weight: 'bold',
            size: 11
          },
          formatter: (value) => value
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `Orders: ${context.parsed.x}`;
            }
          }
        },
        zoom: {
          zoom: {
            wheel: {
              enabled: true,
            },
            pinch: {
              enabled: true
            },
            mode: 'xy',
          },
          pan: {
            enabled: true,
            mode: 'xy'
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            stepSize: 1
          }
        }
      }
    }
  });
}

function createTimelineChart(ctx, data) {
  const onTimeDeliveries = data.filter(item => {
    if (!item.actual_delivery_date || item.delivery_done !== "Yes") return false;
    const actualDate = new Date(item.actual_delivery_date);
    const latestDate = getLatestDate(item);
    return latestDate && actualDate <= latestDate;
  }).length;

  const lateDeliveries = data.filter(item => {
    if (!item.actual_delivery_date || item.delivery_done !== "Yes") return false;
    const actualDate = new Date(item.actual_delivery_date);
    const latestDate = getLatestDate(item);
    return latestDate && actualDate > latestDate;
  }).length;

  const pendingDeliveries = data.filter(item => item.delivery_done === "No").length;

  advancedChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['On Time', 'Late', 'Pending'],
      datasets: [{
        data: [onTimeDeliveries, lateDeliveries, pendingDeliveries],
        backgroundColor: ['#10B981', '#EF4444', '#F59E0B']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1,
      plugins: {
        legend: {
          position: 'bottom'
        },
        datalabels: {
          display: true,
          color: 'white',
          font: {
            weight: 'bold',
            size: 14
          },
          formatter: (value, ctx) => {
            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = ((value / total) * 100).toFixed(1);
            return `${value}\n(${percentage}%)`;
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = ((context.parsed / total) * 100).toFixed(1);
              return `${context.label}: ${context.parsed} deliveries (${percentage}%)`;
            }
          }
        },
        zoom: {
          zoom: {
            wheel: {
              enabled: true,
            },
            pinch: {
              enabled: true
            },
            mode: 'xy',
          },
          pan: {
            enabled: true,
            mode: 'xy'
          }
        }
      }
    }
  });
}

function createExpenditureChart(ctx, data) {
  const expenditures = {};
  data.forEach(item => {
    const exp = item.expenditure_head || "Unknown";
    expenditures[exp] = (expenditures[exp] || 0) + 1;
  });

  advancedChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Object.keys(expenditures),
      datasets: [{
        label: 'Order Count',
        data: Object.values(expenditures),
        backgroundColor: '#8B5CF6'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1,
      plugins: {
        legend: {
          display: false
        },
        datalabels: {
          display: true,
          anchor: 'end',
          align: 'top',
          color: 'black',
          font: {
            weight: 'bold',
            size: 12
          },
          formatter: (value) => value
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `Orders: ${context.parsed.y}`;
            }
          }
        },
        zoom: {
          zoom: {
            wheel: {
              enabled: true,
            },
            pinch: {
              enabled: true
            },
            mode: 'xy',
          },
          pan: {
            enabled: true,
            mode: 'xy'
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1
          }
        }
      }
    }
  });
}