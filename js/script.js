// ======================
// CONFIGURATION ADMIN
// ======================
// Le catalogue est desormais gere depuis l'interface d'admin (/admin),
// qui ecrit directement dans data/produits.json. Plus besoin de Google Sheet.
const PRODUCTS_JSON_URL = "data/produits.json";

// Libellés affichés pour les boutons de filtre (facultatif).
// Si une catégorie n'est pas dans cette liste, son nom brut est utilisé tel quel.
const CATEGORY_LABELS = {
  farine: "Farines",
  epice: "Épices",
  jus: "Jus",
  naturel: "Produits naturels",
};

let PRODUCTS = {}; // { id_produit: { nom, categorie, emoji, variants: [...] } }


// ======================
// CHARGEMENT DES PRODUITS DEPUIS data/produits.json
// ======================
async function loadProducts() {
  const grid = document.getElementById("products");

  grid.innerHTML = "<p class='text-center w-100 py-5'>Chargement des produits...</p>";

  try {
    const response = await fetch(PRODUCTS_JSON_URL, { cache: "no-store" });
    if (!response.ok) throw new Error("Réponse réseau invalide");
    const data = await response.json();

    PRODUCTS = groupProducts(data.produits || []);
    renderCategoryFilters(PRODUCTS);
    renderProducts(PRODUCTS);
  } catch (err) {
    console.error("Erreur de chargement des produits :", err);
    grid.innerHTML = "<p class='text-center w-100 py-5'>Impossible de charger les produits pour le moment. Réessaie plus tard.</p>";
  }
}

// ======================
// RÉSOLUTION DU CHEMIN D'IMAGE
// ======================
// Accepte soit un nom de fichier local (dans images/), soit un lien direct
// (ex: image hébergée sur imgbb.com ou Google Drive), soit un chemin
// genere par l'admin (images/produits-admin/...).
function resolveImageSrc(image) {
  if (!image) return "images/placeholder.jpg";
  if (image.startsWith("http://") || image.startsWith("https://")) {
    return image;
  }
  return `images/${image}`;
}

// ======================
// FAVORIS (localStorage, sans compte)
// ======================
function getFavorites() {
  return JSON.parse(localStorage.getItem("favorites")) || [];
}

function saveFavorites(favs) {
  localStorage.setItem("favorites", JSON.stringify(favs));
}

function toggleFavorite(id) {
  let favs = getFavorites();
  const btn = document.getElementById(`fav-${id}`);

  if (favs.includes(id)) {
    favs = favs.filter((f) => f !== id);
    if (btn) { btn.textContent = "♡"; btn.classList.remove("active"); }
  } else {
    favs.push(id);
    if (btn) { btn.textContent = "❤"; btn.classList.add("active"); }
  }

  saveFavorites(favs);
  updateFavoritesCount();

  // Si on est en vue "favoris" et qu'on vient d'en retirer un, on le masque immédiatement
  if (showingFavoritesOnly && !favs.includes(id)) {
    const card = document.querySelector(`#products .product-item[data-id="${id}"]`);
    if (card) card.style.display = "none";
  }
}

function applyFavoriteStates() {
  const favs = getFavorites();
  favs.forEach((id) => {
    const btn = document.getElementById(`fav-${id}`);
    if (btn) { btn.textContent = "❤"; btn.classList.add("active"); }
  });
  updateFavoritesCount();
}

function updateFavoritesCount() {
  const el = document.getElementById("favorites-count");
  if (el) el.textContent = getFavorites().length;
}

let showingFavoritesOnly = false;

function toggleFavoritesView() {
  showingFavoritesOnly = !showingFavoritesOnly;
  const btn = document.getElementById("favorites-toggle-btn");
  const favs = getFavorites();
  const products = document.querySelectorAll("#products > .product-item");
  const emptyState = document.getElementById("search-empty");

  if (showingFavoritesOnly) {
    if (btn) btn.classList.add("active");
    const searchInput = document.getElementById("product-search");
    if (searchInput) searchInput.value = "";

    let matches = 0;
    products.forEach((product) => {
      const id = product.getAttribute("data-id");
      if (favs.includes(id)) {
        product.style.display = "";
        matches++;
      } else {
        product.style.display = "none";
      }
    });
    if (emptyState) {
      emptyState.textContent = "Vous n'avez pas encore de favoris — cliquez sur ♡ sur un produit pour l'ajouter.";
      emptyState.style.display = matches === 0 ? "block" : "none";
    }
  } else {
    if (btn) btn.classList.remove("active");
    if (emptyState) {
      emptyState.textContent = "Aucun produit ne correspond à votre recherche.";
      emptyState.style.display = "none";
    }
    filterProducts("all");
  }
}


// ======================
// PARTAGE PRODUIT (API native du navigateur)
// ======================
function shareProduct(nom, id) {
  const price = getSelectedPrice(id);
  const siteUrl = window.location.origin + window.location.pathname.replace(/index\.html$/, "");
  const message = `Regarde ce produit chez Epicière : ${nom} à partir de ${price} FCFA 😍`;

  if (navigator.share) {
    // Ouvre le vrai sélecteur d'applications du téléphone (WhatsApp, Messenger, SMS, etc.)
    navigator.share({
      title: "Épicière Bio",
      text: message,
      url: siteUrl,
    }).catch(() => {
      // L'utilisateur a fermé la fenêtre de partage sans rien envoyer : rien à faire
    });
  } else {
    // Repli pour les navigateurs qui ne gèrent pas le partage natif (surtout desktop)
    window.open(`https://wa.me/?text=${encodeURIComponent(message + "\n" + siteUrl)}`, "_blank");
  }
}


function groupProducts(rows) {
  const grouped = {};

  rows.forEach((row) => {
    const id = (row.id_produit || "").trim();
    if (!id) return;

    grouped[id] = {
      id,
      nom: (row.nom_produit || "").trim(),
      categorie: (row.categorie || "").trim(),
      emoji: (row.emoji || "").trim(),
      // Photos supplementaires (facultatives) pour la galerie multi-angles, communes au produit.
      extraImages: [row.image2, row.image3].map((v) => (v || "").trim()).filter(Boolean),
      variants: (row.variants || []).map((v) => ({
        contenance: (v.contenance || "").trim(),
        prix: parseInt(v.prix, 10) || 0,
        image: (v.image || "").trim(),
      })),
    };
  });

  return grouped;
}


// ======================
// GÉNÉRATION DES BOUTONS DE FILTRE (catégories dynamiques)
// ======================
function renderCategoryFilters(products) {
  const categories = [...new Set(Object.values(products).map((p) => p.categorie).filter(Boolean))];
  const filterSection = document.querySelector(".filterProducts");
  if (!filterSection) return;

  filterSection.innerHTML = `<button onclick="filterProducts('all')">Tous</button>` +
    categories.map((cat) => {
      const label = CATEGORY_LABELS[cat] || cat;
      return `<button onclick="filterProducts('${cat}')">${label}</button>`;
    }).join("");
}


// ======================
// GÉNÉRATION DES CARTES PRODUITS (markup Bootstrap)
// ======================
function renderProducts(products) {
  const grid = document.getElementById("products");
  const cardsHtml = Object.values(products).map(buildCardHtml).join("");
  grid.innerHTML = cardsHtml;
  applyFavoriteStates();
  injectProductStructuredData(products);
}

// ======================
// DONNEES STRUCTUREES PRODUITS (Schema.org, generees dynamiquement)
// ======================
// Genere un JSON-LD a partir des produits reellement charges depuis le Google Sheet,
// pour que les infos montrees a Google restent toujours a jour avec le site.
function injectProductStructuredData(products) {
  const siteUrl = window.location.origin + window.location.pathname.replace(/index\.html$/, "");

  const itemListElement = Object.values(products).map((product, index) => {
    const first = product.variants[0] || { prix: 0, image: "" };
    return {
      "@type": "ListItem",
      "position": index + 1,
      "item": {
        "@type": "Product",
        "name": product.nom,
        "image": resolveImageSrc(first.image),
        "category": product.categorie,
        "offers": {
          "@type": "Offer",
          "priceCurrency": "XOF",
          "price": first.prix,
          "availability": "https://schema.org/InStock",
          "url": siteUrl
        }
      }
    };
  });

  const schema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "itemListElement": itemListElement
  };

  let scriptTag = document.getElementById("product-schema");
  if (!scriptTag) {
    scriptTag = document.createElement("script");
    scriptTag.type = "application/ld+json";
    scriptTag.id = "product-schema";
    document.head.appendChild(scriptTag);
  }
  scriptTag.textContent = JSON.stringify(schema);
}

function buildCardHtml(product) {
  const { id, nom, categorie, emoji, variants } = product;
  const first = variants[0] || { contenance: "", prix: 0, image: "" };
  const nomEscaped = nom.replace(/'/g, "\\'");

  const optionsHtml = variants.map((v, i) => {
    const label = v.contenance ? v.contenance : `${v.prix} FCFA`;
    return `<option value="${v.prix}" data-image="${v.image}" ${i === 0 ? "selected" : ""}>${label}</option>`;
  }).join("");

  return `
    <div class="col mb-5 product-item" data-category="${categorie}" data-search="${normalizeText(nom)}" data-id="${id}">
      <div class="card h-100">
        <div class="card-img-wrap">
          <img class="card-img-top" src="${resolveImageSrc(first.image)}" alt="${nom}" id="img-${id}" onclick="openImageModal('${id}')">
          <button type="button" class="btn-favorite" id="fav-${id}" onclick="toggleFavorite('${id}')" aria-label="Ajouter aux favoris">♡</button>
        </div>
        <div class="card-body p-3">
          <div class="text-center">
            <h5 class="fw-bolder mb-2">${emoji ? emoji + " " : ""}${nom}</h5>

            <label class="form-label d-block text-start">Contenance
              <select class="form-select form-select-sm" id="size-${id}" onchange="updatePriceAndImage('${id}')">
                ${optionsHtml}
              </select>
            </label>

            <p class="price-tag my-2" id="prix-${id}">Prix : ${first.prix} FCFA</p>

            <label class="form-label d-block text-start">Quantité
              <input type="number" class="form-control form-control-sm" id="qty-${id}" value="1" min="1">
            </label>
          </div>
        </div>
        <div class="card-footer p-3 pt-0 border-top-0 bg-transparent d-flex gap-2">
          <button class="btn btn-add-cart flex-grow-1" onclick="addToCart('${nomEscaped}', getSelectedPrice('${id}'), 'qty-${id}')">
            Ajouter
          </button>
          <button type="button" class="btn-share" onclick="shareProduct('${nomEscaped}', '${id}')" aria-label="Partager ce produit">
            <i class="bi-share-fill"></i>
          </button>
        </div>
      </div>
    </div>
  `;
}


// ======================
// PRIX / IMAGE SELON LA CONTENANCE (générique, plus besoin d'un bloc par produit)
// ======================
function getSelectedPrice(key) {
  const sel = document.getElementById(`size-${key}`);
  return sel ? parseInt(sel.value, 10) : 0;
}

function updatePrice(key) {
  const price = getSelectedPrice(key);
  const el = document.getElementById(`prix-${key}`);
  if (el) el.innerText = `Prix : ${price} FCFA`;
}

function updatePriceAndImage(key) {
  updatePrice(key);

  const select = document.getElementById(`size-${key}`);
  const img = document.getElementById(`img-${key}`);
  if (!select || !img) return;

  const selectedOption = select.options[select.selectedIndex];
  const imageName = selectedOption ? selectedOption.dataset.image : "";
  if (imageName) img.src = resolveImageSrc(imageName);
}


// ======================
// PANIER (LOCAL STORAGE)
// ======================
let cart = [];
const DELIVERY_FEE = 700;

document.addEventListener("DOMContentLoaded", () => {
  cart = JSON.parse(localStorage.getItem("cart")) || [];
  updateCart();
  updateFavoritesCount();
  loadProducts();

  let deliveryRadios = document.querySelectorAll('input[name="cart-delivery"]');
  deliveryRadios.forEach(radio => {
    radio.addEventListener("change", () => {
      updateCart();
      toggleLocationBlock();
    });
  });
  toggleLocationBlock();
});

function toggleLocationBlock() {
  const block = document.getElementById("location-block");
  if (!block) return;
  block.style.display = getCartDeliveryOption() === "yes" ? "block" : "none";
}


// ======================
// AJOUT AU PANIER
// ======================
function addToCart(name, price, qtyId) {
  let qty = 1;

  if (qtyId) {
    let input = document.getElementById(qtyId);
    if (input) {
      qty = parseInt(input.value);
    }
  }

  if (isNaN(qty) || qty <= 0) {
    qty = 1;
  }

  let existing = cart.find(item => item.name === name);

  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({
      name: name,
      price: price,
      qty: qty
    });
  }

  showAddAnimation();
  updateCart();
}


// ======================
// UPDATE PANIER
// ======================
function updateCart() {
  let cartItems = document.getElementById("cart-items");
  let subtotal = 0;

  cartItems.innerHTML = "";

  cart.forEach((item, index) => {
    let itemTotal = item.price * item.qty;
    subtotal += itemTotal;

    cartItems.innerHTML += `
      <div class="cart-item-row">
        <div class="cart-item-info">
          <p class="mb-1">${item.name}</p>
          <span class="cart-item-total">${itemTotal} FCFA</span>
        </div>
        <div class="cart-item-qty">
          <button type="button" class="qty-btn" onclick="decreaseQty(${index})" aria-label="Diminuer la quantité">−</button>
          <span class="qty-value">${item.qty}</span>
          <button type="button" class="qty-btn" onclick="increaseQty(${index})" aria-label="Augmenter la quantité">+</button>
        </div>
        <button type="button" class="remove-btn" onclick="removeItem(${index})" aria-label="Retirer l'article">❌</button>
      </div>
    `;
  });

  let deliveryOption = getCartDeliveryOption();
  let deliveryFee = deliveryOption === "yes" ? DELIVERY_FEE : 0;
  let total = subtotal + deliveryFee;

  document.getElementById("subtotal").innerText = subtotal;
  document.getElementById("delivery-fee").innerText = deliveryFee;
  document.getElementById("total").innerText = total;

  let totalQty = cart.reduce((sum, item) => sum + item.qty, 0);
  const cartCountEls = document.querySelectorAll("#cart-count, #floating-cart-count");
  cartCountEls.forEach(el => {
    if (el) el.innerText = totalQty;
  });

  localStorage.setItem("cart", JSON.stringify(cart));
}


// ======================
// SUPPRIMER ITEM
// ======================
// ======================
// MODIFIER LA QUANTITE DEPUIS LE PANIER
// ======================
function increaseQty(index) {
  if (!cart[index]) return;
  cart[index].qty += 1;
  updateCart();
}

function decreaseQty(index) {
  if (!cart[index]) return;
  cart[index].qty -= 1;
  if (cart[index].qty <= 0) {
    cart.splice(index, 1);
  }
  updateCart();
}

function removeItem(index) {
  cart.splice(index, 1);
  updateCart();
}


// ======================
// OUVRIR / FERMER PANIER (Bootstrap Offcanvas)
// ======================
function openCart() {
  const cartEl = document.getElementById("cart");
  const instance = bootstrap.Offcanvas.getOrCreateInstance(cartEl);
  instance.show();
}

function closeCart() {
  const cartEl = document.getElementById("cart");
  const instance = bootstrap.Offcanvas.getOrCreateInstance(cartEl);
  instance.hide();
}


// ======================
// WHATSAPP CHECKOUT
// ======================
let deliveryLocation = null; // { lat, lng }

function shareLocation() {
  const btn = document.getElementById("location-btn");
  const status = document.getElementById("location-status");

  if (!navigator.geolocation) {
    status.textContent = "La géolocalisation n'est pas disponible sur cet appareil/navigateur.";
    status.className = "small mt-2 mb-0 error";
    return;
  }

  btn.disabled = true;
  status.textContent = "Localisation en cours...";
  status.className = "small mt-2 mb-0";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      deliveryLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      status.textContent = "✅ Position partagée — elle sera jointe à votre commande.";
      status.className = "small mt-2 mb-0 ok";
      btn.textContent = "📍 Position mise à jour";
      btn.disabled = false;
    },
    (error) => {
      deliveryLocation = null;
      let msg = "Impossible de récupérer votre position. Vous pourrez indiquer votre adresse directement sur WhatsApp.";
      if (error.code === error.PERMISSION_DENIED) {
        msg = "Localisation refusée. Vous pourrez indiquer votre adresse directement sur WhatsApp.";
      }
      status.textContent = msg;
      status.className = "small mt-2 mb-0 error";
      btn.disabled = false;
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

function getCartDeliveryOption() {
  let choice = document.querySelector('input[name="cart-delivery"]:checked');
  return choice ? choice.value : "no";
}

function getDeliveryOption() {
  const value = getCartDeliveryOption();
  return value === "yes" ? "Oui (livraison à domicile)" : "Non (retrait en boutique)";
}

function checkout() {
  if (cart.length === 0) {
    alert("Votre panier est vide !");
    return;
  }

  let message = "Bonjour, je souhaite commander :\n\n";
  let total = 0;

  cart.forEach(item => {
    let itemTotal = item.price * item.qty;
    total += itemTotal;

    message += `- ${item.name} x${item.qty} = ${itemTotal} FCFA\n`;
  });

  let delivery = getDeliveryOption();
  let deliveryOptionValue = getCartDeliveryOption();
  let deliveryFee = deliveryOptionValue === "yes" ? DELIVERY_FEE : 0;
  let totalWithDelivery = total + deliveryFee;

  message += `\nMode de livraison : ${delivery}`;
  message += `\nFrais de livraison : ${deliveryFee} FCFA`;

  if (deliveryOptionValue === "yes" && deliveryLocation) {
    const mapsLink = `https://maps.google.com/?q=${deliveryLocation.lat},${deliveryLocation.lng}`;
    message += `\n📍 Position de livraison : ${mapsLink}`;
  }

  message += `\nTOTAL : ${totalWithDelivery} FCFA`;

  let phone = "2290144917003";

  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`);

  // On vide le panier seulement une fois la commande envoyée
  cart = [];
  deliveryLocation = null;
  const status = document.getElementById("location-status");
  if (status) { status.textContent = ""; status.className = "small mt-2 mb-0"; }
  const btn = document.getElementById("location-btn");
  if (btn) btn.textContent = "📍 Partager ma position pour la livraison";
  updateCart();
  closeCart();
}


// ======================
// ANIMATION +1
// ======================
function showAddAnimation() {
  let el = document.createElement("div");
  el.innerText = "+1 ajouté";
  el.className = "pop-anim";

  document.body.appendChild(el);

  setTimeout(() => {
    el.remove();
  }, 800);
}

// ======================
// RECHERCHE PRODUITS
// ======================
// Enlève les accents pour que "epice" trouve aussi "Épice" par exemple.
function normalizeText(str) {
  return (str || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function searchProducts(query) {
  const normalizedQuery = normalizeText(query);
  const products = document.querySelectorAll("#products > .product-item");
  const filterButtons = document.querySelectorAll(".filterProducts button");

  if (normalizedQuery === "") {
    // Recherche vide : on repasse sur la catégorie "Tous"
    filterProducts("all");
    return;
  }

  // Une recherche active neutralise le filtre par catégorie et la vue favoris
  filterButtons.forEach((btn) => btn.classList.remove("active"));
  exitFavoritesView();

  let matches = 0;
  products.forEach((product) => {
    const searchable = product.getAttribute("data-search") || "";
    if (searchable.includes(normalizedQuery)) {
      product.style.display = "";
      matches++;
    } else {
      product.style.display = "none";
    }
  });

  const emptyState = document.getElementById("search-empty");
  if (emptyState) {
    emptyState.textContent = "Aucun produit ne correspond à votre recherche.";
    emptyState.style.display = matches === 0 ? "block" : "none";
  }
}

function clearSearch() {
  const input = document.getElementById("product-search");
  if (input) input.value = "";
  filterProducts("all");
}


function filterProducts(category) {
  let products = document.querySelectorAll("#products > .product-item");

  // Cliquer une catégorie vide la recherche en cours et quitte la vue favoris, pour rester cohérent
  const searchInput = document.getElementById("product-search");
  if (searchInput) searchInput.value = "";
  const emptyState = document.getElementById("search-empty");
  if (emptyState) emptyState.style.display = "none";
  exitFavoritesView();

  products.forEach(product => {
    let productCategory = product.getAttribute("data-category");

    if (category === "all" || productCategory === category) {
      product.style.display = "";
    } else {
      product.style.display = "none";
    }
  });

  document.getElementById("products").scrollIntoView({ behavior: "smooth", block: "start" });
}

// Quitte la vue "favoris" sans redéclencher un filtrage (évite la récursion avec filterProducts)
function exitFavoritesView() {
  showingFavoritesOnly = false;
  const favBtn = document.getElementById("favorites-toggle-btn");
  if (favBtn) favBtn.classList.remove("active");
}


// ======================
// LIGHTBOX / GALERIE MULTI-PHOTOS
// ======================
let galleryImages = [];
let galleryIndex = 0;

function openImageModal(id) {
  const modal = document.getElementById("imageModal");
  const currentImg = document.getElementById(`img-${id}`);
  const product = PRODUCTS[id];

  // Photo actuellement affichee sur la carte (dependante de la contenance choisie) en premier,
  // puis les photos supplementaires eventuelles (colonnes image2/image3 du Sheet), sans doublons.
  const candidates = [currentImg ? currentImg.src : "", ...(product ? product.extraImages.map(resolveImageSrc) : [])];
  galleryImages = [...new Set(candidates.filter(Boolean))];
  galleryIndex = 0;

  renderGallerySlide();
  modal.style.display = "block";
}

function renderGallerySlide() {
  const modalImg = document.getElementById("modalImage");
  const arrows = document.querySelectorAll(".gallery-arrow");
  const dots = document.getElementById("gallery-dots");

  modalImg.src = galleryImages[galleryIndex];

  if (galleryImages.length > 1) {
    arrows.forEach((a) => (a.style.display = "flex"));
    dots.style.display = "flex";
    dots.innerHTML = galleryImages
      .map((_, i) => `<span class="gallery-dot ${i === galleryIndex ? "active" : ""}"></span>`)
      .join("");
  } else {
    arrows.forEach((a) => (a.style.display = "none"));
    dots.style.display = "none";
  }
}

function nextGalleryImage(event) {
  event.stopPropagation();
  galleryIndex = (galleryIndex + 1) % galleryImages.length;
  renderGallerySlide();
}

function prevGalleryImage(event) {
  event.stopPropagation();
  galleryIndex = (galleryIndex - 1 + galleryImages.length) % galleryImages.length;
  renderGallerySlide();
}

function closeImageModal() {
  let modal = document.getElementById("imageModal");
  modal.style.display = "none";
}

window.onclick = function(event) {
  let modal = document.getElementById("imageModal");
  if (event.target == modal) {
    modal.style.display = "none";
  }
};
