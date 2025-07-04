let editor;
const openedTabs = {}; // { filename: model }
const fileHandles = {}; // { filename: FileSystemFileHandle }
let currentDirectoryHandle = null;
let currentQuote = '';
// Load Monaco
require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.34.1/min/vs' } });
require(['vs/editor/editor.main'], function () {
    editor = monaco.editor.create(document.getElementById('monaco'), {
        value: '',
        language: 'plaintext',
        theme: 'vs-dark',
        automaticLayout: true
    });

    let mousePos = { x: 0, y: 0 };

    editor.getDomNode().addEventListener('mouseup', function (e) {
        mousePos = { x: e.clientX, y: e.clientY };
    });

     // Aktifkan Emmet untuk HTML dan CSS
    window.emmetMonaco.emmetHTML(monaco);
    window.emmetMonaco.emmetCSS(monaco);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.UpArrow, () => {
        editor.trigger('keyboard', 'editor.action.moveLinesUpAction', {});
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.DownArrow, () => {
        editor.trigger('keyboard', 'editor.action.moveLinesDownAction', {});
    });
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.UpArrow, () => {
        editor.trigger('keyboard', 'cursorColumnSelectUp', {});
    });
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.DownArrow, () => {
        editor.trigger('keyboard', 'cursorColumnSelectDown', {});
    });

    let hintWidget = null;

    function removeHintWidget() {
        if (hintWidget) {
            editor.removeContentWidget(hintWidget);
            hintWidget = null;
        }
    }

    editor.onDidChangeCursorSelection((e) => {
    const selection = editor.getSelection();
    const text = editor.getModel().getValueInRange(selection);

    // Hapus jika tidak ada teks terpilih
    if (!text.trim()) {
        removeHintWidget();
        return;
    }

    // Hapus hint lama sebelum membuat baru
    removeHintWidget();

    const id = 'myHintWidget';
    const domNode = document.createElement('div');
    domNode.innerHTML = '<i class="bi bi-stars"></i>';
    domNode.title = 'Klik untuk lakukan aksi';
    domNode.style.left = `${mousePos.x}px`;
    domNode.style.top = `${mousePos.y}px`;
    domNode.style.background = '#2d3436';
    domNode.style.color = '#74b9ff';
    domNode.style.padding = '3px 6px';
    domNode.style.borderRadius = '4px';
    domNode.style.cursor = 'pointer';
    domNode.style.fontSize = '17px';
    domNode.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
    domNode.style.userSelect = 'none';

    function scrollToBottom() {
        const chatContent = document.getElementById('chat-content');
        chatContent.scrollTop = chatContent.scrollHeight;
    }

    function escapeHTML(str) {
        return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function truncateText(text, maxLength = 100) {
        return text.length > maxLength ? text.slice(0, maxLength) + '…' : text;
    }

    domNode.onclick = () => {
        currentQuote = text; // tetap full, untuk dikirim nanti

        const shortPreview = truncateText(text, 100); // tampilkan max 100 karakter
        $('#quote-box').html(`<i class="bi bi-quote"></i> <pre style="margin: 0;">${escapeHTML(shortPreview)}</pre>`);
        $('#quote-box').show();

        showChatSidebar();
        $('#chat-input').val('').trigger('input').focus();
    };

    hintWidget = {
        getId: () => id,
        getDomNode: () => domNode,
        getPosition: () => {
            return {
                position: selection.getEndPosition(),
                preference: [monaco.editor.ContentWidgetPositionPreference.BELOW]
            };
        }
    };

    editor.addContentWidget(hintWidget);
    }); 
});

$(document).on('click', '.folder > .folder-toggle', function () {
    $(this).siblings('ul').slideToggle(150);
});

function getLanguageFromFilename(filename) {
    if (filename.endsWith('.js')) return 'javascript';
    if (filename.endsWith('.html')) return 'html';
    if (filename.endsWith('.css')) return 'css';
    if (filename.endsWith('.env')) return 'markdown';
    if (filename.endsWith('.md')) return 'markdown';
    if (filename.endsWith('.json')) return 'json';
    return 'javascript';
}

async function getFilesFromDirectory(dirHandle, path = '') {
    const files = {};
    for await (const [name, handle] of dirHandle.entries()) {
        const fullPath = path ? `${path}/${name}` : name;
        if (handle.kind === 'file') {
            const file = await handle.getFile();
            const content = await file.text();
            files[fullPath] = content;
            fileHandles[fullPath] = handle;
        } else if (handle.kind === 'directory') {
            const nestedFiles = await getFilesFromDirectory(handle, fullPath);
            Object.assign(files, nestedFiles);
        }
    }
    return files;
}

let allFiles = [];

async function openDirectory() {
    try {
        const dirHandle = await window.showDirectoryPicker();
        currentDirectoryHandle = dirHandle; // ⬅️ Simpan di global
        document.getElementById('project-name').textContent = dirHandle.name.toUpperCase();
        showSpinner();

        const files = await getFilesFromDirectory(dirHandle);
        allFiles = Object.keys(files); 
        $('#file-list').empty();

        const tree = buildTreeFromPaths(files);
        const treeDOM = renderTree(tree);
        $('#file-list').append(treeDOM);
    } catch (e) {
        console.error('Directory access error:', e);
    } finally {
        $('#settings-button').show();
        hideSpinner();
    }
}

function showSpinner() {
    const overlay = document.getElementById('spinner-overlay');
    overlay.style.display = 'flex';
}

function hideSpinner() {
    const overlay = document.getElementById('spinner-overlay');
    overlay.style.display = 'none';
}


function openTab(filename) {
    if (!$(`.tab[data-filename="${filename}"]`).length) {
        const displayName = filename.split('/').pop();
        $('.tabs').append(`
          <div class="tab" data-filename="${filename}">
            <img src="${getFileIcon(displayName)}" style='width:14px;margin-right:5px'> ${displayName}
            <span class="close">&times;</span>
          </div>
        `);

        const lang = getLanguageFromFilename(filename);
        const model = monaco.editor.createModel('', lang);
        openedTabs[filename] = model;

        // Set initial content
        fileHandles[filename].getFile().then(file => {
            file.text().then(text => {
                model.setValue(text);
            });
        });
    }

    $('.tab').removeClass('active');
    $(`.tab[data-filename="${filename}"]`).addClass('active');
    editor.setModel(openedTabs[filename]);
}

$(document).on('click', '.file', function () {
    const filename = $(this).data('filename');
    openTab(filename);
    setActiveFileInSidebar(filename); // Tambahkan baris ini
});

$(document).on('click', '.tab', function (e) {
    const filename = $(this).data('filename');

    if ($(e.target).hasClass('close')) {
        const isActive = $(this).hasClass('active');
        const nextTab = $(this).next('.tab').length ? $(this).next() : $(this).prev();

        if (openedTabs[filename]) {
            openedTabs[filename].dispose();
            delete openedTabs[filename];
        }

        $(this).remove();

        if (isActive && nextTab.length) {
            openTab(nextTab.data('filename'));
        } else if (isActive) {
            editor.setModel(null);
        }

    } else {
        openTab(filename);
    }
});

// Sidebar resizing
$(document).ready(function () {
    const sidebar = document.getElementById('sidebar');
    const resizer = document.getElementById('resizer');
    let isResizing = false;

    $('#settings-button').hide();

    resizer.addEventListener('mousedown', function () {
        isResizing = true;
        document.body.style.cursor = 'ew-resize';
    });

    document.addEventListener('mousemove', function (e) {
        if (!isResizing) return;
        const minWidth = 150;
        const maxWidth = 500;
        let newWidth = e.clientX;
        if (newWidth < minWidth) newWidth = minWidth;
        if (newWidth > maxWidth) newWidth = maxWidth;
        sidebar.style.width = newWidth + 'px';
    });

    document.addEventListener('mouseup', function () {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = '';
        }
    });

    $('#collapse-all-button').on('click', function () {
        $('#file-list .folder ul').slideUp(150); // Sembunyikan semua folder yang terbuka
    });
});

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();

    const icons = {
        js: '/assets/icons/js.png',
        ts: '/assets/icons/ts.png',
        html: '/assets/icons/html.png',
        css: '/assets/icons/paint.png',
        md: '/assets/icons/file.png',
        json: '/assets/icons/json.png',
        png: '/assets/icons/photo.png',
        jpg: '/assets/icons/photo.png',
        jpeg: '/assets/icons/photo.png',
        gif: '/assets/icons/photo.png',
        svg: '/assets/icons/photo.png',
        txt: '/assets/icons/file.png',
        default: '/assets/icons/file.png'
    };

    return icons[ext] || icons.default;
}

function buildTreeFromPaths(paths) {
    const tree = {};

    for (const fullPath in paths) {
        const parts = fullPath.split('/');
        let current = tree;

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (!current[part]) {
                current[part] = i === parts.length - 1 ? null : {};
            }
            current = current[part];
        }
    }

    return tree;
}

function renderTree(tree, basePath = '') {
    const ul = $('<ul></ul>');

    for (const name in tree) {
        const fullPath = basePath ? `${basePath}/${name}` : name;

        if (tree[name] === null) {
            // File
            const icon = `<img src="${getFileIcon(name)}" style='width:16px'>`;
            const file = $(`<li class="file" data-filename="${fullPath}">${icon} ${name}</li>`);

            ul.append(file);
        } else {
            // Folder
            const folder = $(`
            <li class="folder" data-path="${fullPath}">
                <span class="folder-toggle"><img src='/assets/icons/folder.png' width='16px'> ${name}</span>
            </li>
            `);
            const children = renderTree(tree[name], fullPath);
            children.hide(); // collapsed by default
            folder.append(children);
            ul.append(folder);
        }
    }

    $('#collapse-all-button').show();

    return ul;
}

$(document).on('click', '#save-file', async function () {
    const activeTab = $('.tab.active');
    if (!activeTab.length) {
        console.log("❌ No file open");
        return;
    }

    const filename = activeTab.data('filename');
    const model = openedTabs[filename];
    let fileHandle = fileHandles[filename];

    if (!model) {
        console.log("❌ No content to save.");
        return;
    }

    try {
        if (!fileHandle) {
            console.warn("⚠️ No fileHandle found for", filename);
            const newHandle = await window.showSaveFilePicker({
                suggestedName: filename.split('/').pop(), // hanya nama file
                types: [
                    {
                        description: 'Text Files',
                        accept: {
                            'text/plain': ['.txt', '.js', '.json', '.html', '.css', '.md']
                        }
                    }
                ]
            });

            fileHandles[filename] = newHandle;
            fileHandle = newHandle;
        }

        const writable = await fileHandle.createWritable();
        await writable.write(model.getValue());
        await writable.close();

        console.log(`✅ Saved: ${filename}`);

        // Refresh file tree jika ada folder terbuka
        if (currentDirectoryHandle) {
            const opened = getOpenedFolders();
            const files = await getFilesFromDirectory(currentDirectoryHandle);
            $('#file-list').empty();
            const tree = buildTreeFromPaths(files);
            const treeDOM = renderTree(tree);
            $('#file-list').append(treeDOM);
            restoreOpenedFolders(opened);
        }

    } catch (err) {
        console.error("❌ Failed to save:", err);
    }
});

$(document).on('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        $('#save-file').click();
    }
});

// Inisialisasi xterm
const term = new Terminal({
    theme: { background: '#000000' },
    fontSize: 14,
});

const fitAddon = new window.FitAddon.FitAddon();
term.loadAddon(fitAddon);
fitAddon.fit();

term.open(document.getElementById('terminal-container'));
const socket = new WebSocket('ws://localhost:3000/terminal');

socket.onopen = () => {
    term.write('🔌 Connected to terminal\r\n');
};

socket.onmessage = (event) => {
    term.write(event.data);
};

term.onData((data) => {
    socket.send(data);
});

// Toggle show/hide terminal
$('#toggle-terminal').on('click', () => {
    const isHidden = $('#terminal-container').hasClass('hidden');
    $('#terminal-container, #terminal-resizer').toggleClass('hidden');
    $('#toggle-terminal').html(isHidden ? '&#x2013;' : '+');
    term.focus();
});

// Resize terminal height
(() => {
    const resizer = document.getElementById('terminal-resizer');
    const terminal = document.getElementById('terminal-container');

    let isDragging = false;

    resizer.addEventListener('mousedown', function (e) {
        isDragging = true;
        document.body.style.cursor = 'ns-resize';
    });

    document.addEventListener('mousemove', function (e) {
        if (!isDragging) return;

        const containerRect = terminal.parentElement.getBoundingClientRect();
        const newHeight = containerRect.bottom - e.clientY;
        terminal.style.height = Math.max(100, newHeight) + 'px';

        fitAddon.fit(); // Update ukuran baris/kolom
    });

    document.addEventListener('mouseup', function () {
        isDragging = false;
        document.body.style.cursor = '';
    });
})();

document.addEventListener('keydown', async function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        await openDirectory(); // langsung buka file picker
    }
});

document.addEventListener('keydown', function (e) {
    // Ctrl + ~ (Tilde, KeyCode 192)
    if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        const isHidden = $('#terminal-container').hasClass('hidden');
        $('#terminal-container, #terminal-resizer').toggleClass('hidden');
        $('#toggle-terminal').html(isHidden ? '&#x2013;' : '+');
        if (!isHidden) {
        term.blur();
    } else {
        term.focus();
        fitAddon.fit(); // Panggil ulang di sini agar resize sukses
    }
    }
});

// Aktifkan sortable pada tab
new Sortable(document.querySelector('.tabs'), {
    animation: 150,
    ghostClass: 'dragging',
    filter: '.close', // biar tombol close tidak ikut terseret
    onEnd: () => {
        // Opsional: kamu bisa simpan urutan tab kalau perlu
        console.log('Tabs reordered!');
    }
});

document.addEventListener('keydown', function (e) {
    // Ctrl + Shift + W untuk tutup tab editor
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();

        const activeTab = document.querySelector('.tab.active');
        if (!activeTab) return;

        const filename = activeTab.dataset.filename;
        const nextTab = activeTab.nextElementSibling || activeTab.previousElementSibling;

        if (openedTabs[filename]) {
            openedTabs[filename].dispose();
            delete openedTabs[filename];
        }

        activeTab.remove();

        if (nextTab) {
            const nextFilename = nextTab.dataset.filename;
            nextTab.classList.add('active');
            editor.setModel(openedTabs[nextFilename]);
        } else {
            editor.setModel(null);
        }
    }
});


function createNewFile() {
  $('#new-file-name').val('');
  $('#new-file-modal').fadeIn();
}

$('.new-file-close').on('click', function () {
  $('#new-file-modal').fadeOut();
});

$('#create-new-file').on('click', async function () {
  const filename = $('#new-file-name').val().trim();
  if (!filename) return;

  const fullPath = filename;

  if (openedTabs[fullPath]) {
    openTab(fullPath);
    $('#new-file-modal').fadeOut();
    return;
  }

  try {
    const newHandle = await window.showSaveFilePicker({
      suggestedName: filename,
      types: [{
        description: 'Text Files',
        accept: {
          'text/plain': ['.txt', '.js', '.json', '.html', '.css', '.md']
        }
      }]
    });

    fileHandles[fullPath] = newHandle;

    const lang = getLanguageFromFilename(fullPath);
    const model = monaco.editor.createModel('', lang);
    openedTabs[fullPath] = model;

    $('.tabs').append(`
      <div class="tab" data-filename="${fullPath}">
        ${filename}
        <span class="close">&times;</span>
      </div>
    `);

    $('.tab').removeClass('active');
    $(`.tab[data-filename="${fullPath}"]`).addClass('active');
    editor.setModel(model);

  } catch (err) {
    console.error('❌ Gagal membuat file baru:', err);
  } finally {
    $('#new-file-modal').fadeOut();
  }
});

function getOpenedFolders() {
    const opened = [];
    $('#file-list .folder ul:visible').each(function () {
        const folderLi = $(this).closest('.folder');
        const path = folderLi.data('path');
        if (path) {
            opened.push(path);
        }
    });
    return opened;
}

function restoreOpenedFolders(openedFolders) {
    $('#file-list .folder').each(function () {
        const path = $(this).data('path');
        if (openedFolders.includes(path)) {
            $(this).children('ul').show(); // buka kembali
        }
    });
}

// Buat context menu custom
const contextMenu = $('<div id="context-menu"></div>').css({
  position: 'absolute',
  display: 'none',
  background: '#2c3e50',
  color: 'white',
  padding: '5px',
  borderRadius: '4px',
  boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
  zIndex: 10000,
  fontSize: '14px',
  cursor: 'pointer'
});

const tabContextMenu = $('<div id="tab-context-menu"></div>').css({
  position: 'absolute',
  display: 'none',
  background: '#2c3e50',
  color: 'white',
  padding: '5px 0',
  borderRadius: '4px',
  boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
  zIndex: 10000,
  fontSize: '14px',
  minWidth: '180px'
});
tabContextMenu.append(`
  <div class="tab-menu-item" data-action="close-others" style="padding: 5px 15px; cursor: pointer;">🔀 Close Other Tabs</div>
  <div class="tab-menu-item" data-action="close-left" style="padding: 5px 15px; cursor: pointer;">⬅️ Close Tabs to the Left</div>
  <div class="tab-menu-item" data-action="close-right" style="padding: 5px 15px; cursor: pointer;">➡️ Close Tabs to the Right</div>
  <div class="tab-menu-item" data-action="close-all" style="padding: 5px 15px; cursor: pointer;">🧹 Close All Tabs</div>
`);

$('body').append(tabContextMenu);

$('body').append(contextMenu);

let contextTarget = null; // untuk tahu file/folder yang diklik
let tabContextTarget = null;

$(document).on('contextmenu', '.tab', function (e) {
  e.preventDefault();
  tabContextTarget = $(this);
  tabContextMenu.css({ top: e.pageY, left: e.pageX }).show();
});

$(document).on('click', '.tab-menu-item', function () {
  const action = $(this).data('action');
  const allTabs = $('.tab');
  const index = tabContextTarget ? allTabs.index(tabContextTarget) : -1;

  if (action === 'close-others' && index !== -1) {
    allTabs.each(function (i) {
      if (i !== index) $(this).find('.close').click();
    });
  }

  if (action === 'close-left' && index !== -1) {
    allTabs.slice(0, index).find('.close').click();
  }

  if (action === 'close-right' && index !== -1) {
    allTabs.slice(index + 1).find('.close').click();
  }

  if (action === 'close-all') {
    allTabs.find('.close').click();
  }

  tabContextMenu.hide();
});

$('#sidebar').on('contextmenu', function (e) {
  e.preventDefault();

  contextTarget = $(e.target).closest('.file, .folder-toggle');

  contextMenu.empty(); // reset menu

  if (contextTarget.hasClass('file')) {
    contextMenu.append('<div class="ctx-delete-file">🗑️ Delete File</div>');
  }

  // Always allow new file
  contextMenu.append('<div class="ctx-new-file">➕ New File</div>');

  contextMenu.css({ top: e.pageY, left: e.pageX }).show();
});

$(document).on('click', '.ctx-new-file', function () {
  contextMenu.hide();
  createNewFile();
});

$(document).on('click', '.ctx-delete-file', async function () {
  contextMenu.hide();

  if (!contextTarget) return;
  const filename = contextTarget.data('filename');
  const handle = fileHandles[filename];
  if (!handle || !currentDirectoryHandle) return;

  const pathParts = filename.split('/');
  const fileNameOnly = pathParts.pop();
  let parentHandle = currentDirectoryHandle;

  try {
    for (const part of pathParts) {
      parentHandle = await parentHandle.getDirectoryHandle(part);
    }

    await parentHandle.removeEntry(fileNameOnly);

    // Hapus tab terkait (jika terbuka)
    $(`.tab[data-filename="${filename}"]`).remove();
    if (openedTabs[filename]) {
      openedTabs[filename].dispose();
      delete openedTabs[filename];
    }

    // Refresh sidebar
    const files = await getFilesFromDirectory(currentDirectoryHandle);
    $('#file-list').empty();
    const tree = buildTreeFromPaths(files);
    const treeDOM = renderTree(tree);
    $('#file-list').append(treeDOM);

  } catch (err) {
    console.error("❌ Gagal menghapus file:", err);
  }
});

$(document).on('click', function () {
  contextMenu.hide();
  contextTarget = null;
  tabContextMenu.hide();
  tabContextTarget = null;
});

contextMenu.on('click', function (e) {
  // Jangan lakukan apapun jika bukan klik langsung di item menu
  if (!$(e.target).hasClass('ctx-new-file')) return;
  createNewFile();
});

// Buka modal saat tombol settings ditekan
$('#settings-button').on('click', function () {
  $('#settings-modal').fadeIn();
});

// Tutup modal saat tombol close diklik
$('.modal-close').on('click', function () {
  $('#settings-modal').fadeOut();
});

// Tutup modal saat klik di luar modal-content
$(window).on('click', function (e) {
  if ($(e.target).is('#settings-modal')) {
    $('#settings-modal').fadeOut();
  }
});

// Simpan ke localStorage saat apply
$('#apply-settings').on('click', function () {
  const selectedTheme = $('#theme-selector-modal').val();
  localStorage.setItem('editor-theme', selectedTheme);
  monaco.editor.setTheme(selectedTheme);
  $('#settings-modal').fadeOut();
});

// Terapkan tema dari localStorage saat load
const savedTheme = localStorage.getItem('editor-theme');
if (savedTheme) {
    setTimeout(() => {
        monaco.editor.setTheme(savedTheme);
        $('#theme-selector-modal').val(savedTheme);
  }, 2000); // set dropdown sesuai tema tersimpan
}

// Tampilkan chat sidebar saat Ctrl + B ditekan
let flagOpenChat = false;
document.addEventListener('keydown', function (e) {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const isCtrlB = (isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === 'b';

  if (isCtrlB) {
    e.preventDefault();
    if (flagOpenChat == true) {
        hideChatSidebar();
        flagOpenChat = false;
        return;
    }else{
        showChatSidebar();
        $('#chat-input').focus();
        flagOpenChat = true;
    }
  }
});

$('#chat-close').on('click', function () {
  hideChatSidebar();
});

function showChatSidebar() {
  $('#chat-sidebar').addClass('show');
}

function hideChatSidebar() {
  $('#chat-sidebar').removeClass('show');
}

function escapeHTML(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function scrollToBottom() {
    const chatContent = document.getElementById('chat-content');
    chatContent.scrollTop = chatContent.scrollHeight;
}

$('#chat-send').on('click', sendChatMessage);
let chatHistory = [
  {
    role: 'user',
    parts: [{
      text: `Kamu adalah asisten terbaik saya. 
        Jawablah setiap pertanyaan dengan ramah, ringkas, dan jelas. Jika pertanyaannya berupa kode, 
        jawab to the point, tanpa belibet
        Jika ada yang bertanya nama kamu adalah AI Super Editor diciptakan oleh tim terbaik.
        Jawablah pertanyaan dengan format typography yang rapi, dengan emoji juga boleh agar memperindah jawaban
        berikan tombol copy untuk salin jawaban dari ai khusus jawaban bentuk code, dan buat tombol sederhana dan kecil
        `
    }]
  }
];

async function sendChatMessage() {
  const message = $('#chat-input').val().trim();
  if (!message) return;

  let html = '';
  let fullPrompt = '';

  if (currentQuote) {
    const quoteHTML = `
      <div style="font-size: 12px; color: #888; margin-bottom: 5px;">
        <i class="bi bi-quote"></i>
        <pre style="border:2px dashed #3b839d; padding: 5px; border-radius: 4px; color: #dcdde1;">${escapeHTML(currentQuote)}</pre>
      </div>
    `;
    html += quoteHTML;
    fullPrompt += `Berikan penjelasan dari kode berikut:\n${currentQuote}\n\n`;
  }

  html += `<div>${escapeHTML(message)}</div>`;
  fullPrompt += message;

  // Tampilkan pesan pengguna
  $('#chat-content').append(`
    <div style="margin-bottom: 10px;padding:10px;background:#104d63; border-radius: 4px; color: #fff;">
      ${html}
    </div>
  `);

  $('#chat-input').val('').trigger('input');
  $('#quote-box').hide();
  currentQuote = '';

  const chatContent = document.getElementById('chat-content');
  chatContent.scrollTop = chatContent.scrollHeight;

  // Loading indicator
  const loadingId = 'loading-' + Date.now();
  $('#chat-content').append(`
    <div id="${loadingId}" style="margin-bottom: 10px; color: #aaa;">
      <span style="color:#00cec9;font-weight:bold">AI Assistant</span>
      <span class="typing-indicator"><span>.</span><span>.</span><span>.</span></span>
    </div>
  `);
  chatContent.scrollTop = chatContent.scrollHeight;

  // Tambahkan ke history
  chatHistory.push({
    role: 'user',
    parts: [{ text: fullPrompt }]
  });

  const aiResponse = await sendToGemini(chatHistory);
  $(`#${loadingId}`).remove();

  // Tampilkan respons AI langsung sebagai HTML dari markdown
  const responseHTML = marked.parse(aiResponse);
  $('#chat-content').append(`
    <div style="margin-bottom: 10px; background: #1e272e; padding: 10px; border-radius: 4px; color: #dfe6e9;">
      <span style="color:#00cec9;font-weight:bold">AI Assistant</span><br>
      <div class="ai-response-text" style="margin-top:5px;">${responseHTML}</div>
    </div>
  `);

  chatContent.scrollTop = chatContent.scrollHeight;
}

async function sendToGemini(history) {
  const apiKey = 'AIzaSyCWcjAHwGaJS2kGZv2N61518jC9_ysAZG0';
  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: history })
  });

  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '(Tidak ada respons)';
}

$('#chat-input').on('keydown', function (e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
});

// Escape function untuk aman di HTML
function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showTyping() {
  $('#typing-indicator').fadeIn();
}

function hideTyping() {
  $('#typing-indicator').fadeOut();
}

// Tambahkan elemen HTML untuk input pencarian
$('body').append(`
    <div id="file-search-modal" style="
        display: none;
        position: fixed;
        top: 0; left: 0;
        width: 100%; height: 100%;
        background: rgba(0,0,0,0.5);
        z-index: 10001;
        display: flex;
        justify-content: center;
        align-items: center;
        font-family: 'Lexend', sans-serif;
        ">
        <div style="
            position: relative;
            width: 400px;
            max-width: 90%;
            background-color: #1e272e;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 0 20px rgba(0,0,0,0.5);
            color: white;
        ">
            <!-- Tombol close pojok kanan -->
            <button id="file-search-close" style="
            position: absolute;
            top: -13px;
            right: -7px;
            background: transparent;
            border: none;
            color: #bbb;
            font-size: 18px;
            cursor: pointer;
            " title="Tutup">&times;</button>

            <input type="text" id="file-search-input" placeholder="Cari file..." style="
            width: 100%;
            padding: 10px;
            border: 1px solid #444;
            border-radius: 6px;
            background: #2f3640;
            color: white;
            outline: none;
            font-size: 14px;
            ">

            <ul id="file-search-results" style="
            list-style: none;
            padding: 0;
            margin-top: 12px;
            max-height: 200px;
            overflow-y: auto;
            "></ul>
        </div>
    </div>

`);

$('#file-search-modal').hide();

// Fungsi untuk menampilkan modal pencarian
function showFileSearchModal() {
    $('#file-search-modal').fadeIn();
    $('#file-search-input').val('').focus();
    $('#file-search-results').empty();

    $('#file-search-input').off('input').on('input', function () {
        const query = $(this).val().toLowerCase();

        const results = allFiles.filter(filename =>
            filename.toLowerCase().includes(query) &&
            !filename.includes('node_modules') &&
            !filename.includes('.git')
        );

        $('#file-search-results').empty();
        results.forEach(filename => {
            $('#file-search-results').append(`<li data-filename="${filename}">${filename}</li>`);
        });
    });
}

function openFolderInSidebar(filePath) {
    const pathParts = filePath.split('/');
    pathParts.pop(); // Hapus nama file
    let currentPath = '';

    pathParts.forEach(part => {
        currentPath += part;
        const folderElement = $(`.folder[data-path="${currentPath}"]`);
        if (folderElement.length) {
            folderElement.children('ul').slideDown(150); // Buka folder
        }
        currentPath += '/';
    });
}

// Fungsi untuk menyembunyikan modal pencarian
function hideFileSearchModal() {
    $('#file-search-modal').fadeOut();
    $('#file-search-input').val(''); // Reset input
    $('#file-search-results').empty(); // Reset hasil
}

// Event listener untuk menutup modal
$('#file-search-close').on('click', function() {
    hideFileSearchModal();
});

// Event listener untuk input pencarian
$('#file-search-input').on('input', function() {
    console.log('aaa');
    
    const query = $(this).val().toLowerCase();
    const results = [];

    // Cari file di dalam openedTabs
    for (const filename in openedTabs) {
        if (filename.toLowerCase().includes(query)) {
            results.push(filename);
        }
    }

    // Tampilkan hasil pencarian
    $('#file-search-results').empty();
    results.forEach(filename => {
        $('#file-search-results').append(`<li data-filename="${filename}" style="padding: 5px; cursor: pointer;">${filename}</li>`);
    });
});

// Event listener untuk memilih file dari hasil pencarian
$(document).on('click', '#file-search-results li', function() {
    const filename = $(this).data('filename');
    openTab(filename);
    openFolderInSidebar(filename);
    setActiveFileInSidebar(filename);
    hideFileSearchModal();
});

// Keyboard shortcut untuk menampilkan modal pencarian (CTRL + P)
document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        showFileSearchModal();
    }
});

function setActiveFileInSidebar(filename) {
    $('.file').removeClass('active'); // Hapus kelas active dari semua file
    $(`.file[data-filename="${filename}"]`).addClass('active'); // Tambahkan kelas active ke file yang dipilih
}

$('#file-search-close').on('click', function () {
    $('#file-search-modal').hide();
});