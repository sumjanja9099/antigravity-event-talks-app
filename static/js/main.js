// BigQuery Release Notes Explorer Frontend Logic

// Global state variables
let allUpdates = [];
let currentFilter = 'all';
let currentSearch = '';
let activeUpdate = null;

// UI Elements
const elements = {
    refreshBtn: document.getElementById('refresh-btn'),
    refreshIcon: document.getElementById('refresh-icon'),
    exportCsvBtn: document.getElementById('export-csv-btn'),
    lastUpdatedVal: document.getElementById('last-updated-val'),
    
    // Stats
    statTotal: document.getElementById('stat-total'),
    statFeatures: document.getElementById('stat-features'),
    statChanges: document.getElementById('stat-changes'),
    statDeprecated: document.getElementById('stat-deprecated'),
    statCards: document.querySelectorAll('.stat-card'),
    
    // Controls
    searchInput: document.getElementById('search-input'),
    clearSearch: document.getElementById('clear-search'),
    tabBtns: document.querySelectorAll('.tab-btn'),
    
    // States
    loadingState: document.getElementById('loading-state'),
    errorState: document.getElementById('error-state'),
    errorMsg: document.getElementById('error-msg'),
    retryBtn: document.getElementById('retry-btn'),
    emptyState: document.getElementById('empty-state'),
    notesGrid: document.getElementById('notes-grid'),
    
    // Modal & Composer
    tweetModal: document.getElementById('tweet-modal'),
    closeModalBtn: document.getElementById('close-modal-btn'),
    modalNoteType: document.getElementById('modal-note-type'),
    modalNoteDate: document.getElementById('modal-note-date'),
    modalNoteHtml: document.getElementById('modal-note-html'),
    modalNoteLink: document.getElementById('modal-note-link'),
    tweetTextarea: document.getElementById('tweet-textarea'),
    charCounter: document.getElementById('char-counter'),
    progressCircle: document.getElementById('progress-circle'),
    resetTweetBtn: document.getElementById('reset-tweet-btn'),
    mockTweetText: document.getElementById('mock-tweet-text'),
    copyTweetBtn: document.getElementById('copy-tweet-btn'),
    postTweetBtn: document.getElementById('post-tweet-btn'),
    mockCard: document.getElementById('mock-card'),
    
    // Toast
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toast-message')
};

// SVG Circle circumference configurations for progress indicator
const CIRCLE_RADIUS = 12;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS; // ~75.4
if (elements.progressCircle) {
    elements.progressCircle.style.strokeDasharray = `${CIRCLE_CIRCUMFERENCE} ${CIRCLE_CIRCUMFERENCE}`;
}

// Initial initialization
document.addEventListener('DOMContentLoaded', () => {
    fetchNotes(false);
    setupEventListeners();
});

// Setup Event Listeners
function setupEventListeners() {
    // Refresh buttons
    elements.refreshBtn.addEventListener('click', () => fetchNotes(true));
    elements.retryBtn.addEventListener('click', () => fetchNotes(true));
    
    // Export CSV
    elements.exportCsvBtn.addEventListener('click', exportToCSV);
    
    // Search input
    elements.searchInput.addEventListener('input', (e) => {
        currentSearch = e.target.value.trim().toLowerCase();
        elements.clearSearch.style.display = currentSearch ? 'block' : 'none';
        applyFiltersAndSearch();
    });
    
    // Clear search
    elements.clearSearch.addEventListener('click', () => {
        elements.searchInput.value = '';
        currentSearch = '';
        elements.clearSearch.style.display = 'none';
        applyFiltersAndSearch();
    });
    
    // Category tabs
    elements.tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            elements.tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.type;
            applyFiltersAndSearch();
        });
    });
    
    // Stat cards trigger tabs filtering
    elements.statCards.forEach(card => {
        card.addEventListener('click', () => {
            const filter = card.dataset.filter;
            let targetTab;
            if (filter === 'all') targetTab = 'all';
            else if (filter === 'feature') targetTab = 'Feature';
            else if (filter === 'change') targetTab = 'Change';
            else if (filter === 'deprecated') targetTab = 'Deprecated';
            
            const tabBtn = Array.from(elements.tabBtns).find(btn => btn.dataset.type === targetTab);
            if (tabBtn) tabBtn.click();
        });
    });
    
    // Modal events
    elements.closeModalBtn.addEventListener('click', closeModal);
    elements.tweetModal.addEventListener('click', (e) => {
        if (e.target === elements.tweetModal) closeModal();
    });
    
    // Tweet textarea live updates
    elements.tweetTextarea.addEventListener('input', updateTweetLengthAndPreview);
    
    // Reset tweet
    elements.resetTweetBtn.addEventListener('click', resetTweetText);
    
    // Copy Tweet
    elements.copyTweetBtn.addEventListener('click', copyTweetToClipboard);
    
    // Post to X
    elements.postTweetBtn.addEventListener('click', postTweetToX);
}

// Fetch notes from Flask API
async function fetchNotes(forceRefresh = false) {
    showLoading(true);
    elements.refreshIcon.classList.add('spinning');
    elements.refreshBtn.disabled = true;
    
    try {
        const url = `/api/notes${forceRefresh ? '?refresh=true' : ''}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        if (data.success) {
            allUpdates = data.updates;
            updateLastFetched(data.last_fetched);
            updateStatsDashboard();
            applyFiltersAndSearch();
            
            if (data.warning) {
                showToast(data.warning, 'warning');
            }
        } else {
            throw new Error(data.error || 'Failed to fetch release notes.');
        }
    } catch (error) {
        console.error('Error fetching release notes:', error);
        elements.errorMsg.textContent = error.message || 'Something went wrong while connecting to the server.';
        showError(true);
    } finally {
        showLoading(false);
        elements.refreshIcon.classList.remove('spinning');
        elements.refreshBtn.disabled = false;
    }
}

// Update the stats panels
function updateStatsDashboard() {
    elements.statTotal.textContent = allUpdates.length;
    
    const features = allUpdates.filter(u => u.type === 'Feature').length;
    const changes = allUpdates.filter(u => u.type === 'Change').length;
    const deprecated = allUpdates.filter(u => u.type === 'Deprecated').length;
    
    elements.statFeatures.textContent = features;
    elements.statChanges.textContent = changes;
    elements.statDeprecated.textContent = deprecated;
}

// Update the last updated time text
function updateLastFetched(isoString) {
    if (!isoString) return;
    const date = new Date(isoString);
    elements.lastUpdatedVal.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' ' + date.toLocaleDateString();
}

// Filter and Search
function applyFiltersAndSearch() {
    let filtered = allUpdates;
    
    // Apply Category Filter
    if (currentFilter !== 'all') {
        filtered = filtered.filter(u => u.type === currentFilter);
    }
    
    // Apply Search Filter
    if (currentSearch) {
        filtered = filtered.filter(u => {
            return u.content_text.toLowerCase().includes(currentSearch) || 
                   u.type.toLowerCase().includes(currentSearch) ||
                   u.date.toLowerCase().includes(currentSearch);
        });
    }
    
    renderNotesGrid(filtered);
}

// Render the updates in a list
function renderNotesGrid(notes) {
    elements.notesGrid.innerHTML = '';
    
    if (notes.length === 0) {
        elements.notesGrid.style.display = 'none';
        elements.emptyState.style.display = 'flex';
        return;
    }
    
    elements.emptyState.style.display = 'none';
    elements.notesGrid.style.display = 'grid';
    
    notes.forEach(note => {
        const card = document.createElement('div');
        card.className = 'note-card';
        card.dataset.id = note.id;
        
        // Define badge style
        let badgeClass = 'info';
        if (note.type === 'Feature') badgeClass = 'feature';
        else if (note.type === 'Change') badgeClass = 'change';
        else if (note.type === 'Deprecated') badgeClass = 'deprecated';
        
        card.innerHTML = `
            <div class="note-card-header">
                <div class="note-card-meta">
                    <span class="update-badge ${badgeClass}">${note.type}</span>
                    <span class="note-date">${note.date}</span>
                </div>
                <div class="note-card-actions">
                    <button class="btn btn-secondary btn-sm copy-link-btn" title="Copy documentation link">
                        <i class="fa-solid fa-link"></i>
                    </button>
                    <a href="${note.link}" target="_blank" class="btn btn-secondary btn-sm" title="View original documentation">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i>
                    </a>
                </div>
            </div>
            <div class="note-body">
                ${note.content_html}
            </div>
            <div class="note-card-footer">
                <button class="btn btn-secondary copy-card-btn" onclick="copyCardContent('${note.id}')">
                    <i class="fa-regular fa-copy"></i> Copy Content
                </button>
                <button class="btn tweet-btn" onclick="openTweetComposer('${note.id}')">
                    <i class="fa-brands fa-x-twitter"></i> Tweet Update
                </button>
            </div>
        `;
        
        // Copy documentation link handler
        const copyLinkBtn = card.querySelector('.copy-link-btn');
        copyLinkBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(note.link)
                .then(() => showToast('Documentation link copied!'))
                .catch(() => showToast('Failed to copy link', 'error'));
        });
        
        elements.notesGrid.appendChild(card);
    });
}

// UI State Toggles
function showLoading(show) {
    elements.loadingState.style.display = show ? 'flex' : 'none';
    if (show) {
        elements.notesGrid.style.display = 'none';
        elements.errorState.style.display = 'none';
        elements.emptyState.style.display = 'none';
    }
}

function showError(show) {
    elements.errorState.style.display = show ? 'flex' : 'none';
    if (show) {
        elements.loadingState.style.display = 'none';
        elements.notesGrid.style.display = 'none';
        elements.emptyState.style.display = 'none';
    }
}

// Open Tweet Composer Modal
window.openTweetComposer = function(noteId) {
    const note = allUpdates.find(u => u.id === noteId);
    if (!note) return;
    
    activeUpdate = note;
    
    // Fill Note Details in Modal
    elements.modalNoteType.textContent = note.type;
    elements.modalNoteType.className = `update-badge ${note.type.toLowerCase()}`;
    elements.modalNoteDate.textContent = note.date;
    elements.modalNoteHtml.innerHTML = note.content_html;
    elements.modalNoteLink.href = note.link;
    
    // Generate default tweet text
    resetTweetText();
    
    // Display Modal
    elements.tweetModal.style.display = 'flex';
    document.body.style.overflow = 'hidden'; // Disable background scrolling
};

function closeModal() {
    elements.tweetModal.style.display = 'none';
    document.body.style.overflow = 'auto'; // Enable scrolling
    activeUpdate = null;
}

// Generate default tweet template
function generateDefaultTweet(note) {
    // 23 characters is the default for X URL shortener (t.co)
    // We construct the tweet components:
    const header = `Google Cloud BigQuery Update - ${note.date} 🚀\n\n[${note.type}]: `;
    const hashtags = `\n\n#GoogleCloud #BigQuery`;
    
    // Length calculation
    const urlPlaceholderLen = 23;
    const reservedLen = header.length + hashtags.length + urlPlaceholderLen + 6; // some extra margin
    const availableLen = 280 - reservedLen;
    
    let body = note.content_text;
    if (body.length > availableLen) {
        body = body.substring(0, availableLen - 3) + '...';
    }
    
    return `${header}${body}\n\nDocumentation: ${note.link}${hashtags}`;
}

function resetTweetText() {
    if (!activeUpdate) return;
    elements.tweetTextarea.value = generateDefaultTweet(activeUpdate);
    updateTweetLengthAndPreview();
}

// Update Tweet Length Circle & Preview
function updateTweetLengthAndPreview() {
    const text = elements.tweetTextarea.value;
    
    // Calculate length accounting for standard X link shortener t.co (23 chars for any URL)
    const length = calculateXLength(text);
    const charsRemaining = 280 - length;
    
    // Update text counter
    elements.charCounter.textContent = charsRemaining;
    
    // Color states based on character count
    elements.charCounter.className = 'char-counter';
    if (charsRemaining <= 20 && charsRemaining >= 0) {
        elements.charCounter.classList.add('warning');
    } else if (charsRemaining < 0) {
        elements.charCounter.classList.add('danger');
    }
    
    // Update SVG progress ring
    const percent = Math.min(100, (length / 280) * 100);
    const offset = CIRCLE_CIRCUMFERENCE - (percent / 100) * CIRCLE_CIRCUMFERENCE;
    elements.progressCircle.style.strokeDashoffset = offset;
    
    // Color logic for the progress stroke
    if (charsRemaining < 0) {
        elements.progressCircle.style.stroke = 'var(--color-danger)';
    } else if (charsRemaining <= 20) {
        elements.progressCircle.style.stroke = 'var(--color-warning)';
    } else {
        elements.progressCircle.style.stroke = '#1d9bf0'; // Twitter Blue
    }
    
    // Update Live Mock Preview Text (with links converted to clickable mockup links)
    const formattedText = formatTweetPreview(text);
    elements.mockTweetText.innerHTML = formattedText;
    
    // Handle mock preview card visibility
    // If text contains the original documentation URL, display the mock card
    if (activeUpdate && text.includes(activeUpdate.link)) {
        elements.mockCard.style.display = 'flex';
    } else {
        elements.mockCard.style.display = 'none';
    }
}

// Helper to calculate X-compatible length (with URL counts as 23)
function calculateXLength(text) {
    // Regex to match URLs
    const urlRegex = /https?:\/\/[^\s]+/g;
    const urls = text.match(urlRegex) || [];
    
    let plainText = text;
    urls.forEach(url => {
        plainText = plainText.replace(url, '');
    });
    
    // Standard text length + 23 characters per URL
    return plainText.length + (urls.length * 23);
}

// Format the preview text to highlight links and hashtags
function formatTweetPreview(text) {
    if (!text) return '';
    
    // Escape HTML first to prevent XSS in preview
    let escaped = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
        
    // Highlight URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    escaped = escaped.replace(urlRegex, '<a href="$1" target="_blank">$1</a>');
    
    // Highlight Hashtags
    const hashtagRegex = /(#[a-zA-Z0-9_]+)/g;
    escaped = escaped.replace(hashtagRegex, '<a href="https://twitter.com/hashtag/$1" target="_blank">$1</a>');
    
    return escaped;
}

// Copy Tweet Text
function copyTweetToClipboard() {
    const text = elements.tweetTextarea.value;
    navigator.clipboard.writeText(text)
        .then(() => showToast('Tweet text copied to clipboard!'))
        .catch(() => showToast('Failed to copy', 'error'));
}

// Open X Intent to Tweet
function postTweetToX() {
    const text = elements.tweetTextarea.value;
    const length = calculateXLength(text);
    
    if (length > 280) {
        showToast('Tweet is too long (max 280 characters)!', 'error');
        return;
    }
    
    const encodedText = encodeURIComponent(text);
    const xUrl = `https://twitter.com/intent/tweet?text=${encodedText}`;
    window.open(xUrl, '_blank');
}

// Toast System
function showToast(message, type = 'success') {
    elements.toastMessage.textContent = message;
    
    // Configure toast color/icon
    const toastIcon = elements.toast.querySelector('.toast-icon');
    if (type === 'success') {
        elements.toast.style.background = 'rgba(16, 185, 129, 0.95)';
        toastIcon.className = 'fa-solid fa-circle-check toast-icon';
    } else if (type === 'warning') {
        elements.toast.style.background = 'rgba(245, 158, 11, 0.95)';
        toastIcon.className = 'fa-solid fa-circle-exclamation toast-icon';
    } else {
        elements.toast.style.background = 'rgba(239, 68, 68, 0.95)';
        toastIcon.className = 'fa-solid fa-circle-xmark toast-icon';
    }
    
    elements.toast.style.display = 'flex';
    
    // Reset layout transitions
    setTimeout(() => {
        elements.toast.style.display = 'none';
    }, 4000);
}

// Copy card content helper
window.copyCardContent = function(noteId) {
    const note = allUpdates.find(u => u.id === noteId);
    if (!note) return;
    
    navigator.clipboard.writeText(note.content_text)
        .then(() => showToast('Update copied to clipboard!'))
        .catch(() => showToast('Failed to copy', 'error'));
};

// Export currently filtered release notes to CSV
function exportToCSV() {
    let filtered = allUpdates;
    
    // Apply Category Filter
    if (currentFilter !== 'all') {
        filtered = filtered.filter(u => u.type === currentFilter);
    }
    
    // Apply Search Filter
    if (currentSearch) {
        filtered = filtered.filter(u => {
            return u.content_text.toLowerCase().includes(currentSearch) || 
                   u.type.toLowerCase().includes(currentSearch) ||
                   u.date.toLowerCase().includes(currentSearch);
        });
    }
    
    if (filtered.length === 0) {
        showToast('No data to export!', 'error');
        return;
    }
    
    // CSV headers
    const headers = ['ID', 'Date', 'Type', 'Content Text', 'Documentation Link'];
    
    // Map updates to rows
    const rows = filtered.map(update => [
        update.id,
        update.date,
        update.type,
        `"${update.content_text.replace(/"/g, '""')}"`,
        update.link
    ]);
    
    // Combine headers and rows
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
    ].join('\n');
    
    // Create Blob and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    // Set filename
    const dateStr = new Date().toISOString().split('T')[0];
    const filterName = currentFilter === 'all' ? 'all' : currentFilter.toLowerCase();
    link.setAttribute('href', url);
    link.setAttribute('download', `bq_release_notes_${filterName}_${dateStr}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('Exported CSV successfully!');
}

