// ========== GAZCOM - MAIN FRONTEND JAVASCRIPT ==========
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000/api'
    : 'https://gazcom-backend.onrender.com/api';

// ========== GLOBAL VARIABLES ==========
let currentSlide = 0;
let autoRotateInterval;
let categoriesData = [];
let featuredProducts = [];

// ========== DOM ELEMENTS ==========
const carouselSlides = document.getElementById('carouselSlides');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const carouselDots = document.getElementById('carouselDots');
const featuredGrid = document.getElementById('featuredGrid');

// Local reliable placeholder (no external network)
const LOCAL_PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='200' viewBox='0 0 300 200'%3E%3Crect width='300' height='200' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23999' font-family='Arial' font-size='14'%3ENo Image%3C/text%3E%3C/svg%3E";

// ========== HELPER FUNCTIONS ==========
function showLoading(container, show = true) {
    if (show) {
        container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-pulse"></i> Loading...</div>';
    }
}

function showError(container, message) {
    container.innerHTML = `<div class="loading-spinner" style="color: red;">⚠️ ${message}</div>`;
}

// ========== FETCH CATEGORIES FOR CAROUSEL ==========
async function fetchCategories() {
    try {
        const response = await fetch(`${API_BASE}/categories`);
        if (!response.ok) throw new Error('Failed to fetch categories');
        const categories = await response.json();
        return categories.filter(cat => cat.name && cat.name.trim() !== '');
    } catch (error) {
        console.error('Error fetching categories:', error);
        // Fallback dummy categories (so carousel works even without backend)
        return [
            { id: 1, name: 'PETROLEUM EQUIPMENTS', description: 'High-quality pumps, nozzles, and storage tanks', image_url: 'https://images.unsplash.com/photo-1581091226033-d5c48150dbaa?w=1200' },
            { id: 2, name: 'PETROLEUM ELECTRICALS', description: 'Explosion-proof lighting, cables, and control systems', image_url: 'https://images.unsplash.com/photo-1563206767-5b18f218e8de?w=1200' },
            { id: 3, name: 'PETROL STATION PARTS AND ACCESSORIES', description: 'Hose swivels, breakaways, and dispenser parts', image_url: 'https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=1200' },
            { id: 4, name: 'PETROLEUM GAS AND ACCESSORIES', description: 'LPG cylinders, regulators, and safety valves', image_url: 'https://images.unsplash.com/photo-1581092335871-4b6e0d0e9b4a?w=1200' },
            { id: 5, name: 'PETROLEUM PERSONAL PROTECTIVE EQUIPMENTS', description: 'Gloves, goggles, flame-resistant coveralls', image_url: 'https://images.unsplash.com/photo-1581092335871-4b6e0d0e9b4a?w=1200' }
        ];
    }
}

// ========== BUILD CAROUSEL SLIDES ==========
function buildCarousel(categories) {
    if (!carouselSlides) return;
    carouselSlides.innerHTML = '';
    carouselDots.innerHTML = '';
    
    categories.forEach((cat, index) => {
        const slide = document.createElement('div');
        slide.className = 'carousel-slide';
        slide.style.backgroundImage = `url(${cat.image_url || 'https://images.unsplash.com/photo-1581091226033-d5c48150dbaa?w=1200'})`;
        slide.innerHTML = `
            <div class="slide-overlay">
                <h2>${escapeHtml(cat.name)}</h2>
                <p>${escapeHtml(cat.description || 'Premium quality products for your petroleum needs')}</p>
                <button class="explore-btn" data-category-id="${cat.id}" data-category-name="${encodeURIComponent(cat.name)}">
                    Explore Now <i class="fas fa-arrow-right"></i>
                </button>
            </div>
        `;
        carouselSlides.appendChild(slide);
        
        const dot = document.createElement('div');
        dot.className = 'dot';
        dot.dataset.index = index;
        dot.addEventListener('click', () => goToSlide(index));
        carouselDots.appendChild(dot);
    });
    
    updateCarousel();
    startAutoRotate();
    
    document.querySelectorAll('.explore-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const categoryId = btn.dataset.categoryId;
            const categoryName = btn.dataset.categoryName;
            window.location.href = `shop.html?category=${categoryId}&name=${categoryName}`;
        });
    });
}

function updateCarousel() {
    const slides = document.querySelectorAll('.carousel-slide');
    const dots = document.querySelectorAll('.dot');
    if (!slides.length) return;
    
    const offset = -currentSlide * 100;
    carouselSlides.style.transform = `translateX(${offset}%)`;
    
    dots.forEach((dot, idx) => {
        if (idx === currentSlide) {
            dot.classList.add('active');
        } else {
            dot.classList.remove('active');
        }
    });
}

function goToSlide(index) {
    const slides = document.querySelectorAll('.carousel-slide');
    if (!slides.length) return;
    currentSlide = (index + slides.length) % slides.length;
    updateCarousel();
    resetAutoRotate();
}

function nextSlide() {
    const slides = document.querySelectorAll('.carousel-slide');
    if (!slides.length) return;
    currentSlide = (currentSlide + 1) % slides.length;
    updateCarousel();
    resetAutoRotate();
}

function prevSlide() {
    const slides = document.querySelectorAll('.carousel-slide');
    if (!slides.length) return;
    currentSlide = (currentSlide - 1 + slides.length) % slides.length;
    updateCarousel();
    resetAutoRotate();
}

function startAutoRotate() {
    if (autoRotateInterval) clearInterval(autoRotateInterval);
    autoRotateInterval = setInterval(() => {
        nextSlide();
    }, 6000);
}

function resetAutoRotate() {
    if (autoRotateInterval) {
        clearInterval(autoRotateInterval);
        startAutoRotate();
    }
}

// Pause on hover
if (carouselSlides) {
    carouselSlides.addEventListener('mouseenter', () => {
        if (autoRotateInterval) clearInterval(autoRotateInterval);
    });
    carouselSlides.addEventListener('mouseleave', startAutoRotate);
}

// ========== FETCH FEATURED PRODUCTS ==========
async function fetchFeaturedProducts() {
    if (!featuredGrid) return;
    showLoading(featuredGrid);
    try {
        const response = await fetch(`${API_BASE}/products/featured`);
        if (!response.ok) throw new Error('Failed to fetch featured products');
        const products = await response.json();
        displayFeaturedProducts(products);
    } catch (error) {
        console.error('Error fetching featured products:', error);
        const dummyProducts = [
            { id: 1, name: 'Fuel Dispenser Nozzle', category: 'PETROLEUM EQUIPMENTS', description: 'Automatic shut-off nozzle, 1" inlet', stock_quantity: 12, image_url: LOCAL_PLACEHOLDER },
            { id: 2, name: 'Explosion-Proof LED Light', category: 'PETROLEUM ELECTRICALS', description: 'Class I Division 1, 100W', stock_quantity: 8, image_url: LOCAL_PLACEHOLDER },
            { id: 3, name: 'LPG Regulator', category: 'PETROLEUM GAS AND ACCESSORIES', description: 'High capacity, 0-4 bar adjustable', stock_quantity: 25, image_url: LOCAL_PLACEHOLDER }
        ];
        displayFeaturedProducts(dummyProducts);
    }
}

function displayFeaturedProducts(products) {
    if (!featuredGrid) return;
    if (!products.length) {
        featuredGrid.innerHTML = '<p>No featured products at the moment.</p>';
        return;
    }
    
    featuredGrid.innerHTML = products.map(product => `
        <div class="product-card">
            <img src="${product.image_url || LOCAL_PLACEHOLDER}" alt="${escapeHtml(product.name)}" class="product-img">
            <div class="product-info">
                <h3 class="product-name">${escapeHtml(product.name)}</h3>
                <p class="product-category">${escapeHtml(product.category_name || product.category)}</p>
                <div class="stock-badge"><i class="fas fa-boxes"></i> Stock: ${product.stock_quantity ?? 'Call for availability'}</div>
                <p class="product-desc">${escapeHtml(product.description ? product.description.substring(0, 100) : 'No description available')}${product.description && product.description.length > 100 ? '...' : ''}</p>
                <button class="inquire-btn" data-product-id="${product.id}" data-product-name="${escapeHtml(product.name)}" data-product-category="${escapeHtml(product.category_name || product.category)}">
                    <i class="fas fa-envelope"></i> Inquire Now
                </button>
            </div>
        </div>
    `).join('');
    
    document.querySelectorAll('.inquire-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = btn.dataset.productId;
            const name = btn.dataset.productName;
            const category = btn.dataset.productCategory;
            openEmailInquiry(id, name, category);
        });
    });
}

function openEmailInquiry(productId, productName, category) {
    const subject = `Inquiry about Product: ${productName} (ID: ${productId})`;
    const body = `Hello GAZCOM,\n\nI am interested in the following product:\n\nProduct Name: ${productName}\nProduct ID: ${productId}\nCategory: ${category}\n\nPlease provide me with more details, availability, and any further information.\n\nThank you.\n\n[Your Name]\n[Your Email]\n[Your Phone]`;
    window.location.href = `mailto:gazcom.gm@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function initMobileMenu() {
    const toggle = document.getElementById('mobileToggle');
    const navMenu = document.getElementById('navMenu');
    if (toggle && navMenu) {
        toggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
        });
    }
}

async function init() {
    initMobileMenu();
    if (prevBtn) prevBtn.addEventListener('click', prevSlide);
    if (nextBtn) nextBtn.addEventListener('click', nextSlide);
    
    const categories = await fetchCategories();
    categoriesData = categories;
    buildCarousel(categories);
    
    await fetchFeaturedProducts();
}

document.addEventListener('DOMContentLoaded', init);