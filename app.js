const App = {
    state: {
        theme: 'light',
        page: 'dashboard',
        prayerTimes: {},
        currentLocation: null,
        qiblaDirection: 0,
        tasbihCount: 0,
        dhikrIndex: 0,
        currentSurah: null,
        notifications: [],
        settings: {
            calendarType: 'hijri',
            prayerNotifications: true,
            imsakiaNotifications: true,
            darkMode: false,
            fontSize: 'medium',
            prayerReminderTime: 5,
            athanVoice: 0
        },
        dhikrList: [
            { text: 'سبحان الله', target: 33 },
            { text: 'الحمد لله', target: 33 },
            { text: 'الله أكبر', target: 34 },
            { text: 'لا إله إلا الله', target: 100 },
            { text: 'أستغفر الله', target: 100 }
        ]
    },

    async init() {
        await this.loadData();
        this.setupEventListeners();
        this.loadSettings();
        this.setupServiceWorker();
        this.initPrayerTimes();
        this.initQibla();
        this.updateDashboard();
        this.showNotification('مرحباً في تطبيق ليزي رمضان', 'success');
    },

    async loadData() {
        try {
            const response = await fetch('data.json');
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            this.state.hadiths = data.hadiths || [];
            this.state.recipes = data.recipes || [];
            this.state.imsakia = data.imsakia || [];
            this.state.duas = data.duas || [];
            this.state.azkar = data.azkar || [];
            this.state.athanVideos = data.videos || [];
        } catch (error) {
            console.error('Error loading data:', error);
            this.showNotification('حدث خطأ في تحميل البيانات', 'error');
        }
    },

    setupEventListeners() {
        document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());
        document.getElementById('menuToggle').addEventListener('click', () => this.toggleMenu());
        document.getElementById('closeMenu').addEventListener('click', () => this.toggleMenu());

        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = e.target.closest('.nav-link').dataset.page;
                this.switchPage(page);
                this.toggleMenu();
            });
        });

        document.getElementById('refreshPrayerTimes').addEventListener('click', () => this.initPrayerTimes());
        document.getElementById('testAthan').addEventListener('click', () => this.playAthan());
        document.getElementById('closeVideo').addEventListener('click', () => this.hideVideoPlayer());

        document.getElementById('resetTasbih').addEventListener('click', () => this.resetTasbih());
        document.getElementById('changeDhikr').addEventListener('click', () => this.changeDhikr());
        document.getElementById('setTarget').addEventListener('click', () => this.setTasbihTarget());

        document.getElementById('calibrateCompass').addEventListener('click', () => this.calibrateCompass());

        document.getElementById('quranSearch').addEventListener('input', (e) => this.searchQuran(e.target.value));
        document.getElementById('hadithSearch').addEventListener('input', (e) => this.searchHadiths(e.target.value));
        document.getElementById('recipeCategory').addEventListener('change', (e) => this.filterRecipes(e.target.value));

        document.getElementById('clearCache').addEventListener('click', () => this.clearCache());
        document.getElementById('exportData').addEventListener('click', () => this.exportData());
        document.getElementById('importData').addEventListener('click', () => this.importData());
        document.getElementById('installApp').addEventListener('click', () => this.installApp());

        document.getElementById('prayerReminderTime').addEventListener('change', (e) => {
            this.state.settings.prayerReminderTime = parseInt(e.target.value);
            this.saveSettings();
        });

        document.getElementById('athanVoice').addEventListener('change', (e) => {
            this.state.settings.athanVoice = parseInt(e.target.value);
            this.saveSettings();
        });

        document.getElementById('calendarType').addEventListener('change', (e) => {
            this.state.settings.calendarType = e.target.value;
            this.saveSettings();
            this.updateDashboard();
        });

        document.getElementById('darkMode').addEventListener('change', (e) => {
            this.state.settings.darkMode = e.target.checked;
            this.saveSettings();
            this.applyTheme();
        });

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
        });

        window.addEventListener('deviceorientation', (e) => this.handleDeviceOrientation(e));
    },

    toggleTheme() {
        this.state.theme = this.state.theme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', this.state.theme);
        localStorage.setItem('theme', this.state.theme);
    },

    toggleMenu() {
        document.getElementById('sidebar').classList.toggle('show');
    },

    switchPage(page) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

        document.getElementById(page).classList.add('active');
        document.querySelector(`[data-page="${page}"]`).classList.add('active');
        this.state.page = page;

        this.updatePageContent();
    },

    async initPrayerTimes() {
        try {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    async (position) => {
                        this.state.currentLocation = {
                            lat: position.coords.latitude,
                            lon: position.coords.longitude
                        };
                        await this.fetchPrayerTimes();
                    },
                    async () => {
                        await this.fetchPrayerTimesByIP();
                    }
                );
            } else {
                await this.fetchPrayerTimesByIP();
            }
        } catch (error) {
            console.error('Error initializing prayer times:', error);
            this.showNotification('حدث خطأ في جلب مواقيت الصلاة', 'error');
        }
    },

    async fetchPrayerTimes() {
        try {
            const response = await fetch(
                `https://api.aladhan.com/v1/timings?latitude=${this.state.currentLocation.lat}&longitude=${this.state.currentLocation.lon}&method=2`
            );
            const data = await response.json();
            
            if (data.code === 200) {
                this.state.prayerTimes = data.data.timings;
                this.updatePrayerTimesDisplay();
                this.schedulePrayerNotifications();
                this.updateNextPrayer();
            }
        } catch (error) {
            console.error('Error fetching prayer times:', error);
            this.showNotification('حدث خطأ في جلب مواقيت الصلاة', 'error');
        }
    },

    async fetchPrayerTimesByIP() {
        try {
            const response = await fetch('https://quran.yousefheiba.com/api/getPrayerTimes');
            const data = await response.json();
            
            this.state.prayerTimes = {
                Fajr: data.data.timings.Fajr,
                Dhuhr: data.data.timings.Dhuhr,
                Asr: data.data.timings.Asr,
                Maghrib: data.data.timings.Maghrib,
                Isha: data.data.timings.Isha
            };
            
            this.updatePrayerTimesDisplay();
            this.schedulePrayerNotifications();
            this.updateNextPrayer();
        } catch (error) {
            console.error('Error fetching prayer times by IP:', error);
            this.showNotification('حدث خطأ في جلب مواقيت الصلاة', 'error');
        }
    },

    updatePrayerTimesDisplay() {
        const prayers = [
            { name: 'الفجر', key: 'Fajr' },
            { name: 'الظهر', key: 'Dhuhr' },
            { name: 'العصر', key: 'Asr' },
            { name: 'المغرب', key: 'Maghrib' },
            { name: 'العشاء', key: 'Isha' }
        ];

        const container = document.getElementById('prayerTimesContainer');
        container.innerHTML = prayers.map(prayer => {
            const time = this.state.prayerTimes[prayer.key];
            const isCurrent = this.isCurrentPrayer(prayer.key);
            const isPassed = this.isPrayerPassed(prayer.key);
            
            return `
                <div class="prayer-time-card ${isCurrent ? 'current' : ''} ${isPassed ? 'passed' : ''}">
                    <div class="prayer-name">${prayer.name}</div>
                    <div class="prayer-time">${time || '--:--'}</div>
                    <div class="prayer-status">${isCurrent ? 'الصلاة الحالية' : isPassed ? 'تمت' : 'قادمة'}</div>
                </div>
            `;
        }).join('');
    },

    isCurrentPrayer(prayerKey) {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const prayerTime = this.convertTimeToMinutes(this.state.prayerTimes[prayerKey]);
        
        return currentTime >= prayerTime && currentTime < prayerTime + 10;
    },

    isPrayerPassed(prayerKey) {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const prayerTime = this.convertTimeToMinutes(this.state.prayerTimes[prayerKey]);
        
        return currentTime > prayerTime + 10;
    },

    convertTimeToMinutes(timeString) {
        if (!timeString) return 0;
        const [hours, minutes] = timeString.split(':').map(Number);
        return hours * 60 + minutes;
    },

    updateNextPrayer() {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        
        const prayers = [
            { name: 'الفجر', key: 'Fajr' },
            { name: 'الظهر', key: 'Dhuhr' },
            { name: 'العصر', key: 'Asr' },
            { name: 'المغرب', key: 'Maghrib' },
            { name: 'العشاء', key: 'Isha' }
        ];

        let nextPrayer = null;
        let nextTime = Infinity;

        prayers.forEach(prayer => {
            const prayerTime = this.convertTimeToMinutes(this.state.prayerTimes[prayer.key]);
            if (prayerTime > currentTime && prayerTime < nextTime) {
                nextPrayer = prayer;
                nextTime = prayerTime;
            }
        });

        if (nextPrayer) {
            document.getElementById('nextPrayerName').textContent = nextPrayer.name;
            document.getElementById('nextPrayerTime').textContent = this.state.prayerTimes[nextPrayer.key];
            
            const timeDiff = nextTime - currentTime;
            this.startCountdown(timeDiff * 60);
        }
    },

    startCountdown(seconds) {
        const countdownElement = document.getElementById('prayerCountdown');
        
        const updateCountdown = () => {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = seconds % 60;
            
            countdownElement.textContent = 
                `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            
            seconds--;
            
            if (seconds >= 0) {
                setTimeout(updateCountdown, 1000);
            } else {
                this.updateNextPrayer();
            }
        };
        
        updateCountdown();
    },

    async playAthan() {
        const videoIndex = this.state.settings.athanVoice;
        const videoUrl = this.state.athanVideos[videoIndex];
        
        if (videoUrl) {
            const videoPlayer = document.getElementById('athanVideo');
            videoPlayer.src = videoUrl;
            document.getElementById('videoPlayer').classList.remove('hidden');
            await videoPlayer.play();
        }
    },

    hideVideoPlayer() {
        const videoPlayer = document.getElementById('athanVideo');
        videoPlayer.pause();
        videoPlayer.src = '';
        document.getElementById('videoPlayer').classList.add('hidden');
    },

    initQibla() {
        if (this.state.currentLocation) {
            this.calculateQiblaDirection();
        }
    },

    calculateQiblaDirection() {
        const { lat, lon } = this.state.currentLocation;
        const meccaLat = 21.4225;
        const meccaLon = 39.8262;
        
        const phiK = (meccaLat * Math.PI) / 180.0;
        const lambdaK = (meccaLon * Math.PI) / 180.0;
        const phi = (lat * Math.PI) / 180.0;
        const lambda = (lon * Math.PI) / 180.0;
        
        const qiblaDirection = 
            Math.atan2(
                Math.sin(lambdaK - lambda),
                Math.cos(phi) * Math.tan(phiK) - Math.sin(phi) * Math.cos(lambdaK - lambda)
            ) * (180 / Math.PI);
        
        this.state.qiblaDirection = (qiblaDirection + 360) % 360;
        this.updateCompass();
    },

    updateCompass() {
        const needle = document.getElementById('compassNeedle');
        const angleElement = document.getElementById('qiblaAngle');
        
        if (needle) {
            needle.style.transform = `translate(-50%, -100%) rotate(${this.state.qiblaDirection}deg)`;
        }
        
        if (angleElement) {
            angleElement.textContent = `${Math.round(this.state.qiblaDirection)}°`;
        }
    },

    handleDeviceOrientation(event) {
        if (event.alpha !== null) {
            const alpha = event.alpha;
            const needle = document.getElementById('compassNeedle');
            
            if (needle) {
                const qiblaAngle = (360 - alpha + this.state.qiblaDirection) % 360;
                needle.style.transform = `translate(-50%, -100%) rotate(${qiblaAngle}deg)`;
            }
        }
    },

    calibrateCompass() {
        if (window.DeviceOrientationEvent) {
            if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                DeviceOrientationEvent.requestPermission()
                    .then(permissionState => {
                        if (permissionState === 'granted') {
                            this.showNotification('تم معايرة البوصلة', 'success');
                        }
                    })
                    .catch(console.error);
            } else {
                this.showNotification('تم معايرة البوصلة', 'success');
            }
        }
    },

    resetTasbih() {
        this.state.tasbihCount = 0;
        this.updateTasbihDisplay();
    },

    changeDhikr() {
        this.state.dhikrIndex = (this.state.dhikrIndex + 1) % this.state.dhikrList.length;
        this.state.tasbihCount = 0;
        this.updateTasbihDisplay();
        this.createTasbihBeads();
    },

    setTasbihTarget() {
        const target = prompt('أدخل الهدف الجديد:', this.state.dhikrList[this.state.dhikrIndex].target);
        if (target && !isNaN(target)) {
            this.state.dhikrList[this.state.dhikrIndex].target = parseInt(target);
            this.updateTasbihDisplay();
            this.createTasbihBeads();
        }
    },

    updateTasbihDisplay() {
        document.getElementById('tasbihCount').textContent = this.state.tasbihCount;
        document.getElementById('tasbihTarget').textContent = this.state.dhikrList[this.state.dhikrIndex].target;
    },

    createTasbihBeads() {
        const beadsContainer = document.getElementById('tasbihBeads');
        const target = this.state.dhikrList[this.state.dhikrIndex].target;
        
        beadsContainer.innerHTML = '';
        
        for (let i = 0; i < target; i++) {
            const bead = document.createElement('div');
            bead.className = 'tasbih-bead';
            if (i < this.state.tasbihCount) {
                bead.classList.add('active');
            }
            
            bead.addEventListener('click', () => {
                if (i === this.state.tasbihCount) {
                    this.state.tasbihCount++;
                    this.updateTasbihDisplay();
                    this.createTasbihBeads();
                    
                    if (this.state.tasbihCount === target) {
                        this.showNotification('تهانينا! لقد أكملت الذكر', 'success');
                    }
                }
            });
            
            beadsContainer.appendChild(bead);
        }
    },

    searchQuran(query) {
        console.log('Searching Quran for:', query);
    },

    searchHadiths(query) {
        if (!this.state.hadiths) return;
        
        const container = document.getElementById('hadithsContainer');
        const filtered = this.state.hadiths.filter(hadith => 
            hadith.text.includes(query) || hadith.title.includes(query)
        );
        
        container.innerHTML = filtered.map(hadith => `
            <div class="hadith-card">
                <div class="hadith-number">${hadith.number}</div>
                <h3>${hadith.title}</h3>
                <div class="hadith-text">${hadith.text}</div>
                <div class="hadith-ref">
                    <strong>الراوي:</strong> ${hadith.narrator} | 
                    <strong>المصدر:</strong> ${hadith.source}
                </div>
            </div>
        `).join('');
    },

    filterRecipes(category) {
        if (!this.state.recipes) return;
        
        const container = document.getElementById('recipesContainer');
        const filtered = category === 'all' 
            ? this.state.recipes 
            : this.state.recipes.filter(recipe => recipe.category === category);
        
        container.innerHTML = filtered.map(recipe => `
            <div class="recipe-card">
                <h3>${recipe.name}</h3>
                <div class="recipe-category">${recipe.category}</div>
                <div class="recipe-text">${recipe.description}</div>
                <button class="btn small" onclick="App.showRecipeDetails(${recipe.id})">📋 التفاصيل</button>
            </div>
        `).join('');
    },

    showRecipeDetails(id) {
        const recipe = this.state.recipes.find(r => r.id === id);
        if (recipe) {
            const modal = this.createModal(`
                <h2>${recipe.name}</h2>
                <div class="recipe-details">
                    <h3>المقادير:</h3>
                    <ul>${recipe.ingredients.map(ing => `<li>${ing}</li>`).join('')}</ul>
                    <h3>طريقة التحضير:</h3>
                    <ol>${recipe.steps.map(step => `<li>${step}</li>`).join('')}</ol>
                </div>
            `);
            document.body.appendChild(modal);
        }
    },

    createModal(content) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <button class="close-modal">✕</button>
                ${content}
            </div>
        `;
        
        modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
        
        return modal;
    },

    updateDashboard() {
        this.updateHijriDate();
        this.updateImsakia();
        this.updateRamadanProgress();
        this.updateDailyContent();
    },

    updateHijriDate() {
        const today = new Date();
        const hijriDate = this.convertToHijri(today);
        document.getElementById('hijriDate').textContent = hijriDate;
        document.getElementById('gregorianDate').textContent = today.toLocaleDateString('ar-SA');
    },

    convertToHijri(date) {
        const islamicMonths = [
            'محرم', 'صفر', 'ربيع الأول', 'ربيع الثاني', 
            'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 
            'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'
        ];
        
        const day = date.getDate();
        const month = date.getMonth();
        const year = date.getFullYear();
        
        const hijriYear = Math.floor((year - 622) * 1.0307);
        const hijriMonth = islamicMonths[month];
        const hijriDay = day;
        
        return `${hijriDay} ${hijriMonth} ${hijriYear}`;
    },

    updateImsakia() {
        const today = new Date();
        const todayDate = today.getDate();
        
        const todayImsakia = this.state.imsakia?.find(day => day.day === todayDate);
        if (todayImsakia) {
            document.getElementById('suhoorTime').textContent = todayImsakia.suhoor;
            document.getElementById('fajrTime').textContent = todayImsakia.fajr;
            document.getElementById('iftarTime').textContent = todayImsakia.iftar;
        }
    },

    updateRamadanProgress() {
        const today = new Date();
        const ramadanStart = new Date(2026, 1, 18);
        const daysPassed = Math.floor((today - ramadanStart) / (1000 * 60 * 60 * 24));
        const progress = Math.min(Math.max(daysPassed / 30 * 100, 0), 100);
        
        document.getElementById('ramadanProgress').style.width = `${progress}%`;
        document.getElementById('ramadanDays').textContent = `اليوم ${daysPassed + 1} من 30`;
    },

    updateDailyContent() {
        if (this.state.hadiths?.length) {
            const randomHadith = this.state.hadiths[Math.floor(Math.random() * this.state.hadiths.length)];
            document.getElementById('dailyHadith').textContent = randomHadith.text;
            document.getElementById('dailyHadithRef').textContent = randomHadith.source;
        }
    },

    updatePageContent() {
        switch (this.state.page) {
            case 'hadith':
                this.displayHadiths();
                break;
            case 'recipes':
                this.displayRecipes();
                break;
            case 'imsakia':
                this.displayImsakia();
                break;
            case 'duas':
                this.displayDuas();
                break;
        }
    },

    displayHadiths() {
        if (!this.state.hadiths) return;
        
        const container = document.getElementById('hadithsContainer');
        container.innerHTML = this.state.hadiths.map(hadith => `
            <div class="hadith-card">
                <div class="hadith-number">${hadith.number}</div>
                <h3>${hadith.title}</h3>
                <div class="hadith-text">${hadith.text}</div>
                <div class="hadith-ref">
                    <strong>الراوي:</strong> ${hadith.narrator} | 
                    <strong>المصدر:</strong> ${hadith.source} | 
                    <strong>الدرجة:</strong> ${hadith.grade}
                </div>
            </div>
        `).join('');
    },

    displayRecipes() {
        if (!this.state.recipes) return;
        
        const container = document.getElementById('recipesContainer');
        container.innerHTML = this.state.recipes.map(recipe => `
            <div class="recipe-card">
                <h3>${recipe.name}</h3>
                <div class="recipe-category">${recipe.category}</div>
                <div class="recipe-text">${recipe.description}</div>
                <div class="recipe-time">⏱️ ${recipe.time} دقيقة</div>
                <button class="btn small" onclick="App.showRecipeDetails(${recipe.id})">📋 التفاصيل</button>
            </div>
        `).join('');
    },

    displayImsakia() {
        if (!this.state.imsakia) return;
        
        const container = document.getElementById('imsakiaBody');
        const today = new Date().getDate();
        
        container.innerHTML = this.state.imsakia.map(day => `
            <tr class="${day.day === today ? 'today' : ''}">
                <td>${day.day}</td>
                <td>${day.date}</td>
                <td>${day.suhoor}</td>
                <td>${day.fajr}</td>
                <td>${day.iftar}</td>
            </tr>
        `).join('');
    },

    displayDuas() {
        if (!this.state.duas) return;
        
        const container = document.getElementById('duasContainer');
        container.innerHTML = this.state.duas.map(dua => `
            <div class="dua-card">
                <h3>${dua.title}</h3>
                <div class="dua-category">${dua.category}</div>
                <div class="dua-text">${dua.text}</div>
                <div class="dua-ref">${dua.reference || ''}</div>
            </div>
        `).join('');
    },

    schedulePrayerNotifications() {
        if (!this.state.settings.prayerNotifications) return;
        
        const prayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
        const reminderMinutes = this.state.settings.prayerReminderTime;
        
        prayers.forEach(prayer => {
            const prayerTime = this.convertTimeToMinutes(this.state.prayerTimes[prayer]);
            const reminderTime = prayerTime - reminderMinutes;
            
            const now = new Date();
            const currentTime = now.getHours() * 60 + now.getMinutes();
            
            if (reminderTime > currentTime) {
                const delay = (reminderTime - currentTime) * 60 * 1000;
                setTimeout(() => {
                    this.showNotification(`موعد صلاة ${this.getPrayerName(prayer)} بعد ${reminderMinutes} دقيقة`, 'warning');
                }, delay);
            }
        });
    },

    getPrayerName(key) {
        const names = {
            Fajr: 'الفجر',
            Dhuhr: 'الظهر',
            Asr: 'العصر',
            Maghrib: 'المغرب',
            Isha: 'العشاء'
        };
        return names[key] || key;
    },

    showNotification(message, type = 'info') {
        const container = document.getElementById('notificationContainer');
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-title">${type === 'success' ? '✅' : type === 'warning' ? '⚠️' : 'ℹ️'}</div>
            <div class="notification-message">${message}</div>
        `;
        
        container.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 5000);
    },

    loadSettings() {
        const saved = localStorage.getItem('appSettings');
        if (saved) {
            this.state.settings = { ...this.state.settings, ...JSON.parse(saved) };
        }
        this.applySettings();
    },

    saveSettings() {
        localStorage.setItem('appSettings', JSON.stringify(this.state.settings));
        this.applySettings();
    },

    applySettings() {
        this.applyTheme();
        this.applyFontSize();
        
        document.getElementById('calendarType').value = this.state.settings.calendarType;
        document.getElementById('prayerNotifications').checked = this.state.settings.prayerNotifications;
        document.getElementById('imsakiaNotifications').checked = this.state.settings.imsakiaNotifications;
        document.getElementById('darkMode').checked = this.state.settings.darkMode;
        document.getElementById('fontSize').value = this.state.settings.fontSize;
        document.getElementById('prayerReminderTime').value = this.state.settings.prayerReminderTime;
        document.getElementById('athanVoice').value = this.state.settings.athanVoice;
    },

    applyTheme() {
        if (this.state.settings.darkMode) {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
        }
    },

    applyFontSize() {
        const sizes = {
            small: '14px',
            medium: '16px',
            large: '18px'
        };
        document.documentElement.style.fontSize = sizes[this.state.settings.fontSize];
    },

    clearCache() {
        if (confirm('هل أنت متأكد من مسح جميع البيانات المحلية؟')) {
            localStorage.clear();
            this.state.settings = {
                calendarType: 'hijri',
                prayerNotifications: true,
                imsakiaNotifications: true,
                darkMode: false,
                fontSize: 'medium',
                prayerReminderTime: 5,
                athanVoice: 0
            };
            this.applySettings();
            this.showNotification('تم مسح جميع البيانات', 'success');
        }
    },

    exportData() {
        const data = {
            settings: this.state.settings,
            tasbihCount: this.state.tasbihCount,
            dhikrIndex: this.state.dhikrIndex
        };
        
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'lazy-ramadan-backup.json';
        a.click();
        URL.revokeObjectURL(url);
        
        this.showNotification('تم تصدير البيانات', 'success');
    },

    importData() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = (e) => {
            const file = e.target.files[0];
            const reader = new FileReader();
            
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    this.state.settings = { ...this.state.settings, ...data.settings };
                    this.state.tasbihCount = data.tasbihCount || 0;
                    this.state.dhikrIndex = data.dhikrIndex || 0;
                    this.saveSettings();
                    this.showNotification('تم استعادة البيانات', 'success');
                } catch (error) {
                    this.showNotification('خطأ في ملف البيانات', 'error');
                }
            };
            
            reader.readAsText(file);
        };
        
        input.click();
    },

    async installApp() {
        if (this.deferredPrompt) {
            this.deferredPrompt.prompt();
            const { outcome } = await this.deferredPrompt.userChoice;
            
            if (outcome === 'accepted') {
                this.showNotification('تم تثبيت التطبيق', 'success');
            }
            
            this.deferredPrompt = null;
        } else {
            this.showNotification('التطبيق مثبت بالفعل', 'info');
        }
    },

    setupServiceWorker() {
        if ('serviceWorker' in navigator) {
            const swContent = `
                const CACHE_NAME = 'lazy-ramadan-v1';
                const urlsToCache = [
                    '/',
                    '/index.html',
                    '/style.css',
                    '/app.js',
                    '/data.json',
                    '/manifest.json'
                ];

                self.addEventListener('install', event => {
                    event.waitUntil(
                        caches.open(CACHE_NAME)
                            .then(cache => cache.addAll(urlsToCache))
                    );
                });

                self.addEventListener('fetch', event => {
                    event.respondWith(
                        caches.match(event.request)
                            .then(response => response || fetch(event.request))
                    );
                });

                self.addEventListener('activate', event => {
                    event.waitUntil(
                        caches.keys().then(keys => 
                            Promise.all(
                                keys.filter(key => key !== CACHE_NAME)
                                    .map(key => caches.delete(key))
                            )
                        )
                    );
                });
            `;
            
            const blob = new Blob([swContent], { type: 'application/javascript' });
            const swUrl = URL.createObjectURL(blob);
            
            navigator.serviceWorker.register(swUrl)
                .then(() => console.log('Service Worker registered'))
                .catch(err => console.error('Service Worker registration failed:', err));
        }
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());