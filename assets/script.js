let editor;
const openedTabs = {}; // { filename: model }
const fileHandles = {}; // { filename: FileSystemFileHandle }
let currentDirectoryHandle = null;

// Load Monaco
require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.34.1/min/vs' } });
require(['vs/editor/editor.main'], function () {
    editor = monaco.editor.create(document.getElementById('monaco'), {
        value: '',
        language: 'plaintext',
        theme: 'vs-dark',
        automaticLayout: true
    });
});

$(document).on('click', '.folder > .folder-toggle', function () {
    $(this).siblings('ul').slideToggle(150);
});

function getLanguageFromFilename(filename) {
    if (filename.endsWith('.js')) return 'javascript';
    if (filename.endsWith('.html')) return 'html';
    if (filename.endsWith('.css')) return 'css';
    if (filename.endsWith('.env')) return 'env';
    if (filename.endsWith('.md')) return 'markdown';
    if (filename.endsWith('.json')) return 'json';
    return 'plaintext';
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

async function openDirectory() {
    try {
        const dirHandle = await window.showDirectoryPicker();
        currentDirectoryHandle = dirHandle; // ⬅️ Simpan di global
        document.getElementById('project-name').textContent = `📁 ${dirHandle.name}`;
        showSpinner();

        const files = await getFilesFromDirectory(dirHandle);
        $('#file-list').empty();

        const tree = buildTreeFromPaths(files);
        const treeDOM = renderTree(tree);
        $('#file-list').append(treeDOM);
    } catch (e) {
        console.error('Directory access error:', e);
    } finally {
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
            ${displayName}
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
});

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();

    const icons = {
        js: '📄',
        ts: '📘',
        html: '🌐',
        css: '🎨',
        md: '📝',
        json: '📦',
        png: '🖼️',
        jpg: '🖼️',
        jpeg: '🖼️',
        gif: '🖼️',
        svg: '🖼️',
        txt: '📄',
        default: '📄'
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
            const icon = getFileIcon(name);
            const file = $(`<li class="file" data-filename="${fullPath}">${icon} ${name}</li>`);

            ul.append(file);
        } else {
            // Folder
            const folder = $(`
        <li class="folder">
          <span class="folder-toggle">📁 ${name}</span>
        </li>
      `);
            const children = renderTree(tree[name], fullPath);
            children.hide(); // collapsed by default
            folder.append(children);
            ul.append(folder);
        }
    }

    return ul;
}

$(document).on('click', '#save-file', async function () {
    const activeTab = $('.tab.active');
    if (!activeTab.length) {
        alert("No file open");
        return;
    }

    const filename = activeTab.data('filename');
    const model = openedTabs[filename];
    let fileHandle = fileHandles[filename];

    if (!model) {
        alert("❌ No content to save.");
        return;
    }

    try {
        // Jika belum punya handle, minta user pilih lokasi
        if (!fileHandle) {
            const newHandle = await window.showSaveFilePicker({
                suggestedName: filename,
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

        try {
            const writable = await fileHandle.createWritable();
            await writable.write(model.getValue());
            await writable.close();

            alert(`✅ Saved: ${filename}`);

            // Reload sidebar
            if (currentDirectoryHandle) {
                const files = await getFilesFromDirectory(currentDirectoryHandle);
                $('#file-list').empty();
                const tree = buildTreeFromPaths(files);
                const treeDOM = renderTree(tree);
                $('#file-list').append(treeDOM);
            }

        } catch (err) {
            console.error("❌ Save failed", err);
            alert("❌ Failed to save file.");
        } 
    } catch (err) {
        console.error("Save failed", err);
        alert("❌ Failed to save file.");
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
    const filename = prompt("Masukkan nama file (mis. newfile.txt):");
    if (!filename) return;

    const fullPath = filename; // bisa lebih kompleks kalau di dalam folder

    if (openedTabs[fullPath]) {
        openTab(fullPath);
        return;
    }

    const lang = getLanguageFromFilename(fullPath);
    const model = monaco.editor.createModel('', lang);
    openedTabs[fullPath] = model;

    // penting: jangan tambahkan ke fileHandles karena ini file baru
    $('.tabs').append(`
        <div class="tab" data-filename="${fullPath}">
            ${filename}
            <span class="close">&times;</span>
        </div>
    `);

    $('.tab').removeClass('active');
    $(`.tab[data-filename="${fullPath}"]`).addClass('active');
    editor.setModel(model);
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
$('body').append(contextMenu);

let contextTarget = null; // untuk tahu file/folder yang diklik

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
});

contextMenu.on('click', function () {
    contextMenu.hide();
    createNewFile();
});
