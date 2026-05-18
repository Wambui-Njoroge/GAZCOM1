// ========== GAZCOM ADMIN PANEL JS (with logout fix) ==========
const API_BASE = 'https://gazcom1.onrender.com/api';
let token = localStorage.getItem('adminToken');


if (!token && !window.location.href.includes('login.html')) {
    window.location.replace('login.html');
}


async function authFetch(url, options = {}) {
    if (!token) {
        localStorage.removeItem('adminToken');
        window.location.replace('login.html');
        throw new Error('No token');
    }
    options.headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers
    };
    const res = await fetch(url, options);
    if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('adminToken');
        window.location.replace('login.html');
        throw new Error('Session expired');
    }
    return res;
}

// ----- Dashboard stats -----
async function loadStats() {
    try {
        const res = await authFetch(`${API_BASE}/admin/stats`);
        const data = await res.json();
        document.getElementById('totalProducts').innerText = data.totalProducts;
        document.getElementById('totalCategories').innerText = data.totalCategories;
        document.getElementById('pendingMessages').innerText = data.pendingMessages;
    } catch(err) { console.error('Stats error:', err); }
}

// ----- Products -----
async function loadProducts() {
    const res = await authFetch(`${API_BASE}/admin/products`);
    const products = await res.json();
    const tbody = document.querySelector('#productsTable tbody');
    if (!tbody) return;
    tbody.innerHTML = products.map(p => `
        <tr>
            <td>${p.id}</td>
            <td>${escapeHtml(p.name)}</td>
            <td>${escapeHtml(p.category_name || '-')}</td>
            <td>${p.stock_quantity}</td>
            <td>${p.is_featured ? 'Yes' : 'No'}</td>
            <td>
                <button class="btn btn-edit" onclick="editProduct(${p.id})">Edit</button>
                <button class="btn btn-danger" onclick="deleteProduct(${p.id})">Delete</button>
            </td>
        </tr>
    `).join('');
}

window.deleteProduct = async function(id) {
    if (confirm('Delete this product?')) {
        await authFetch(`${API_BASE}/admin/products/${id}`, { method: 'DELETE' });
        loadProducts();
        loadStats();
    }
};

window.editProduct = async function(id) {
    await ensureCategoriesLoaded();
    const res = await authFetch(`${API_BASE}/admin/products/${id}`);
    const p = await res.json();
    document.getElementById('productId').value = p.id;
    document.getElementById('productName').value = p.name;
    document.getElementById('productDesc').value = p.description || '';
    document.getElementById('productSku').value = p.sku || '';
    document.getElementById('productStock').value = p.stock_quantity || 0;
    document.getElementById('productImage').value = p.image_url || '';
    document.getElementById('productSpecs').value = p.specifications || '';
    document.getElementById('productFeatured').checked = p.is_featured;
    document.getElementById('productCategory').value = p.category_id;
    document.getElementById('productModalTitle').innerText = 'Edit Product';
    document.getElementById('productModal').style.display = 'flex';
};

// ----- Categories (also populates product dropdown) -----
async function loadCategories() {
    const res = await authFetch(`${API_BASE}/admin/categories`);
    const cats = await res.json();
    const tbody = document.querySelector('#categoriesTable tbody');
    if (tbody) {
        tbody.innerHTML = cats.map(c => `
            <tr>
                <td>${c.id}</td>
                <td>${escapeHtml(c.name)}</td>
                <td>${c.display_order || 0}</td>
                <td>
                    <button class="btn btn-edit" onclick="editCategory(${c.id})">Edit</button>
                    <button class="btn btn-danger" onclick="deleteCategory(${c.id})">Delete</button>
                </td>
            </tr>
        `).join('');
    }
    const catSelect = document.getElementById('productCategory');
    if (catSelect) {
        catSelect.innerHTML = '<option value="">Select Category</option>' +
            cats.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    }
    return cats;
}

async function ensureCategoriesLoaded() {
    const catSelect = document.getElementById('productCategory');
    if (catSelect && catSelect.children.length <= 1) {
        await loadCategories();
    }
}

window.deleteCategory = async function(id) {
    if (confirm('Delete category? Products will lose this category.')) {
        await authFetch(`${API_BASE}/admin/categories/${id}`, { method: 'DELETE' });
        loadCategories();
        loadStats();
    }
};

window.editCategory = function(id) {
    document.getElementById('categoryId').value = id;
    document.getElementById('categoryModalTitle').innerText = 'Edit Category';
    fetch(`${API_BASE}/admin/categories/${id}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.json())
        .then(c => {
            document.getElementById('categoryName').value = c.name;
            document.getElementById('categoryDesc').value = c.description || '';
            document.getElementById('categoryImage').value = c.image_url || '';
            document.getElementById('categoryOrder').value = c.display_order || 0;
        });
    document.getElementById('categoryModal').style.display = 'flex';
};


async function loadMessages() {
    const res = await authFetch(`${API_BASE}/admin/messages`);
    const msgs = await res.json();
    const tbody = document.querySelector('#messagesTable tbody');
    if (!tbody) return;
    tbody.innerHTML = msgs.map(m => `
        <tr>
            <td>${new Date(m.created_at).toLocaleDateString()}</td>
            <td>${escapeHtml(m.name)}</td>
            <td>${escapeHtml(m.email)}</td>
            <td>${escapeHtml(m.message.substring(0, 80))}...</td>
            <td><span style="background:${m.status==='pending'?'orange':'green'};color:white;padding:2px 8px;border-radius:20px;">${m.status}</span></td>
        </tr>
    `).join('');
}

document.getElementById('uploadImageBtn')?.addEventListener('click', async () => {
    const fileInput = document.getElementById('productImageUpload');
    if (!fileInput.files[0]) { alert('Select a file first'); return; }
    const formData = new FormData();
    formData.append('image', fileInput.files[0]);
    const res = await fetch(`${API_BASE}/admin/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
    });
    const data = await res.json();
    if (res.ok) {
        document.getElementById('productImage').value = data.imageUrl;
        alert('Image uploaded successfully');
    } else alert('Upload failed: ' + (data.error || 'Unknown error'));
});

// ----- Modal event listeners -----
document.getElementById('addProductBtn')?.addEventListener('click', async () => {
    document.getElementById('productForm').reset();
    document.getElementById('productId').value = '';
    document.getElementById('productModalTitle').innerText = 'Add Product';
    await ensureCategoriesLoaded();
    document.getElementById('productModal').style.display = 'flex';
});

document.getElementById('productForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('productId').value;
    const data = {
        name: document.getElementById('productName').value,
        description: document.getElementById('productDesc').value,
        category_id: document.getElementById('productCategory').value,
        sku: document.getElementById('productSku').value,
        stock_quantity: parseInt(document.getElementById('productStock').value) || 0,
        image_url: document.getElementById('productImage').value,
        specifications: document.getElementById('productSpecs').value,
        is_featured: document.getElementById('productFeatured').checked
    };
    const url = id ? `${API_BASE}/admin/products/${id}` : `${API_BASE}/admin/products`;
    const method = id ? 'PUT' : 'POST';
    await authFetch(url, { method, body: JSON.stringify(data) });
    document.getElementById('productModal').style.display = 'none';
    loadProducts();
    loadStats();
});

document.getElementById('addCategoryBtn')?.addEventListener('click', () => {
    document.getElementById('categoryForm').reset();
    document.getElementById('categoryId').value = '';
    document.getElementById('categoryModalTitle').innerText = 'Add Category';
    document.getElementById('categoryModal').style.display = 'flex';
});

document.getElementById('categoryForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('categoryId').value;
    const data = {
        name: document.getElementById('categoryName').value,
        description: document.getElementById('categoryDesc').value,
        image_url: document.getElementById('categoryImage').value,
        display_order: parseInt(document.getElementById('categoryOrder').value) || 0
    };
    const url = id ? `${API_BASE}/admin/categories/${id}` : `${API_BASE}/admin/categories`;
    const method = id ? 'PUT' : 'POST';
    await authFetch(url, { method, body: JSON.stringify(data) });
    document.getElementById('categoryModal').style.display = 'none';
    await loadCategories();
    loadStats();
});

// ----- Sidebar navigation -----
document.querySelectorAll('.sidebar a').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.sidebar a').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        const section = link.dataset.section;
        document.getElementById('dashboardSection').style.display = section === 'dashboard' ? 'block' : 'none';
        document.getElementById('productsSection').style.display = section === 'products' ? 'block' : 'none';
        document.getElementById('categoriesSection').style.display = section === 'categories' ? 'block' : 'none';
        document.getElementById('messagesSection').style.display = section === 'messages' ? 'block' : 'none';
        if (section === 'products') loadProducts();
        if (section === 'categories') loadCategories();
        if (section === 'messages') loadMessages();
    });
});


document.getElementById('logoutBtn')?.addEventListener('click', () => {
  
    localStorage.clear();
    sessionStorage.clear();
  
    document.cookie.split(";").forEach(c => {
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });
    
    window.location.replace('login.html');
});


document.getElementById('closeModalBtn')?.addEventListener('click', () => document.getElementById('productModal').style.display = 'none');
document.getElementById('closeCategoryModalBtn')?.addEventListener('click', () => document.getElementById('categoryModal').style.display = 'none');


function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// Initial load
loadStats();
loadCategories();
loadProducts();