document.addEventListener('DOMContentLoaded', () => {
    // --- SELEKTORY I ZMIENNE GLOBALNE ---
    const loadingOverlay = document.getElementById('loadingOverlay');
    const leavesTable = document.getElementById('leavesTable');
    const leavesTableBody = document.getElementById('leavesTableBody');
    const leavesHeaderRow = document.getElementById('leavesHeaderRow');
    const modal = document.getElementById('calendarModal');
    const monthAndYear = document.getElementById('monthAndYear');
    const calendarGrid = document.getElementById('calendarGrid');
    const prevMonthBtn = document.getElementById('prevMonthBtn');
    const nextMonthBtn = document.getElementById('nextMonthBtn');
    const confirmBtn = document.getElementById('confirmSelectionBtn');
    const cancelBtn = document.getElementById('cancelSelectionBtn');
    const searchInput = document.getElementById('searchInput');
    const clearSearchBtn = document.getElementById('clearSearch');
    const contextMenu = document.getElementById('contextMenu');
    const contextClearCell = document.getElementById('contextClearCell');
    const contextOpenCalendar = document.getElementById('contextOpenCalendar');
    const undoButton = document.getElementById('undoButton');

    let activeCell = null; // Obecnie aktywna komórka (TD)
    let cellForModal = null; // Komórka, dla której otwarty jest modal
    let currentYear = new Date().getFullYear();
    let leavesData = {}; // { employeeName: [{startDate, endDate}] }
    let selectedDateRange = { start: null, end: null };

    const undoManager = new UndoManager({
        maxStates: MAX_UNDO_STATES,
        onUpdate: (manager) => {
            undoButton.disabled = !manager.canUndo();
        }
    });

    const setActiveCell = (cell) => {
        if (activeCell) {
            activeCell.classList.remove('active-cell');
            const oldIcon = activeCell.querySelector('.calendar-icon');
            if (oldIcon) oldIcon.remove();
        }
        
        activeCell = cell;

        if (activeCell) {
            activeCell.classList.add('active-cell');
            activeCell.focus();

            // Dodaj ikonę kalendarza
            if (!activeCell.querySelector('.calendar-icon')) {
                const icon = document.createElement('i');
                icon.className = 'fas fa-calendar-alt calendar-icon';
                activeCell.appendChild(icon);
            }
        }
    };

    // --- EDYCJA KOMÓREK ---
    const enterEditMode = (element, clearContent = false, initialChar = '') => {
        if (!element || element.getAttribute('contenteditable') === 'true') return;

        undoManager.pushState(getCurrentTableState());
        
        element.dataset.originalValue = element.textContent;
        element.setAttribute('contenteditable', 'true');

        if (clearContent) {
            element.textContent = initialChar;
        } else if (initialChar) {
            element.textContent += initialChar;
        }

        element.focus();
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(element);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
    };

    const exitEditMode = (element) => {
        if (!element || element.getAttribute('contenteditable') !== 'true') return;

        const originalText = element.dataset.originalValue || '';
        const newText = capitalizeFirstLetter(element.textContent.trim());

        element.setAttribute('contenteditable', 'false');
        element.textContent = newText;

        if (originalText !== newText) {
            saveLeavesData();
            undoManager.pushState(getCurrentTableState());
        }
    };

    // --- FUNKCJE KALENDARZA ---
    const generateCalendar = (year, month) => {
        calendarGrid.innerHTML = `
            <div class="day-name">Pon</div><div class="day-name">Wto</div><div class="day-name">Śro</div>
            <div class="day-name">Czw</div><div class="day-name">Pią</div><div class="day-name">Sob</div>
            <div class="day-name">Nie</div>`;
        monthAndYear.textContent = `${months[month]} ${year}`;
        
        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const startingDay = (firstDayOfMonth === 0) ? 6 : firstDayOfMonth - 1;

        for (let i = 0; i < startingDay; i++) {
            calendarGrid.appendChild(document.createElement('div')).classList.add('day-cell-calendar', 'empty');
        }

        for (let i = 1; i <= daysInMonth; i++) {
            const dayCell = document.createElement('div');
            dayCell.classList.add('day-cell-calendar');
            dayCell.textContent = i;
            const date = new Date(year, month, i);
            dayCell.dataset.date = date.toISOString().split('T')[0];

            if (isDateInRange(date, selectedDateRange)) {
                dayCell.classList.add('selected');
            }
            calendarGrid.appendChild(dayCell);
        }
    };

    const isDateInRange = (date, range) => {
        if (!range.start) return false;
        const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const start = new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate());
        if (!range.end) return d.getTime() === start.getTime();
        const end = new Date(range.end.getFullYear(), range.end.getMonth(), range.end.getDate());
        return d >= start && d <= end;
    };

    const openModal = (cell) => {
        cellForModal = cell;
        selectedDateRange = { start: null, end: null };
        const monthIndex = parseInt(cell.dataset.month, 10);
        generateCalendar(currentYear, monthIndex);
        modal.style.display = 'flex';
    };

    const closeModal = () => {
        modal.style.display = 'none';
        cellForModal = null;
        selectedDateRange = { start: null, end: null };
    };

    // --- LOGIKA POBIERANIA DANYCH I GENEROWANIA TABELI ---
    const getEmployeeNames = async () => {
        const cachedNames = sessionStorage.getItem('employeeNames');
        if (cachedNames) {
            return JSON.parse(cachedNames);
        }

        try {
            const docRef = db.collection("schedules").doc("mainSchedule");
            const doc = await docRef.get();
            if (doc.exists) {
                const data = doc.data();
                if (data.employeeHeaders && Object.keys(data.employeeHeaders).length > 0) {
                    const employeeNames = Object.values(data.employeeHeaders);
                    sessionStorage.setItem('employeeNames', JSON.stringify(employeeNames));
                    return employeeNames;
                }
            }
            throw new Error('Brak zapisanych nagłówków pracowników w Firestore.');
        } catch (error) {
            console.error('Nie udało się pobrać nazwisk pracowników z Firestore:', error);
            let fallbackNames = [];
            for (let i = 0; i < 13; i++) {
                fallbackNames.push(`Pracownik ${i + 1}`);
            }
            return fallbackNames;
        }
    };

    const generateTableHeaders = () => {
        leavesHeaderRow.innerHTML = '<th>Pracownik</th>';
        months.forEach(month => {
            const th = document.createElement('th');
            th.textContent = month;
            leavesHeaderRow.appendChild(th);
        });
    };

    const generateTableRows = (employeeNames) => {
        leavesTableBody.innerHTML = '';
        employeeNames.forEach(name => {
            if (!name) return;
            const tr = document.createElement('tr');
            tr.dataset.employee = name;
            const nameTd = document.createElement('td');
            nameTd.textContent = name;
            nameTd.classList.add('employee-name-cell');
            tr.appendChild(nameTd);
            months.forEach((_, monthIndex) => {
                const monthTd = document.createElement('td');
                monthTd.classList.add('day-cell');
                monthTd.dataset.employee = name;
                monthTd.dataset.month = monthIndex;
                monthTd.setAttribute('tabindex', '0');
                // Add a container for leave blocks
                const blockContainer = document.createElement('div');
                blockContainer.classList.add('leave-block-container');
                monthTd.appendChild(blockContainer);
                tr.appendChild(monthTd);
            });
            leavesTableBody.appendChild(tr);
        });
    };

    // --- WYSZUKIWANIE ---
    const filterTable = (searchTerm) => {
        searchAndHighlight(searchTerm, '#leavesTable', '.employee-name-cell, .day-cell');
    };

    // --- RENDEROWANIE BLOKÓW URLOPÓW ---
    const renderLeaveBlocks = () => {
        // Clear existing blocks
        document.querySelectorAll('.leave-block').forEach(block => block.remove());

        Object.keys(leavesData).forEach(employeeName => {
            const employeeRow = leavesTableBody.querySelector(`tr[data-employee="${employeeName}"]`);
            if (!employeeRow) return;

            leavesData[employeeName].forEach(leavePeriod => {
                const startDate = new Date(leavePeriod.startDate);
                const endDate = new Date(leavePeriod.endDate);

                const startMonth = startDate.getMonth();
                const endMonth = endDate.getMonth();

                for (let m = startMonth; m <= endMonth; m++) {
                    const monthCell = employeeRow.querySelector(`td[data-month="${m}"]`);
                    if (!monthCell) continue;

                    const blockContainer = monthCell.querySelector('.leave-block-container');
                    const block = document.createElement('div');
                    block.classList.add('leave-block');
                    
                    const daysInMonth = new Date(currentYear, m + 1, 0).getDate();
                    const cellWidth = monthCell.offsetWidth;

                    let start = (m === startMonth) ? startDate.getDate() : 1;
                    let end = (m === endMonth) ? endDate.getDate() : daysInMonth;
                    
                    block.style.left = `${((start - 1) / daysInMonth) * 100}%`;
                    block.style.width = `${((end - start + 1) / daysInMonth) * 100}%`;
                    block.textContent = `${startDate.getDate()}.${startDate.getMonth()+1} - ${endDate.getDate()}.${endDate.getMonth()+1}`;
                    
                    blockContainer.appendChild(block);
                }
            });
        });
    };

    // --- UNDO/REDO ---
    const getCurrentTableState = () => {
        return JSON.parse(JSON.stringify(leavesData));
    };

    const applyTableState = (state) => {
        if (!state) return;
        leavesData = JSON.parse(JSON.stringify(state));
        renderLeaveBlocks();
        saveLeavesData();
    };

    const undoLastAction = () => {
        const prevState = undoManager.undo();
        if (prevState) {
            applyTableState(prevState);
        }
    };

    // --- EVENT LISTENERS ---
    leavesTable.addEventListener('click', (event) => {
        const targetCell = event.target.closest('.day-cell');
        if (targetCell) {
            if (event.target.classList.contains('calendar-icon')) {
                openModal(targetCell);
            } else {
                setActiveCell(targetCell);
            }
        } else {
            if (activeCell && activeCell.getAttribute('contenteditable') === 'true') {
                exitEditMode(activeCell);
            }
            setActiveCell(null);
        }
    });

    leavesTable.addEventListener('dblclick', (event) => {
        const targetCell = event.target.closest('.day-cell');
        if (targetCell) {
            enterEditMode(targetCell);
        }
    });

    leavesTable.addEventListener('contextmenu', (event) => {
        const targetCell = event.target.closest('.day-cell');
        if (targetCell) {
            event.preventDefault();
            setActiveCell(targetCell);
            contextMenu.classList.add('visible');
            contextMenu.style.left = `${event.pageX}px`;
            contextMenu.style.top = `${event.pageY}px`;
        }
    });

    document.addEventListener('click', (event) => {
        if (!contextMenu.contains(event.target)) {
            contextMenu.classList.remove('visible');
        }
        if (!event.target.closest('.active-cell')) {
             if (activeCell && activeCell.getAttribute('contenteditable') === 'true') {
                exitEditMode(activeCell);
            }
            setActiveCell(null);
        }
    });

    const clearCellContent = (cell) => {
        if (!cell) return;
        undoManager.pushState(getCurrentTableState());
        const employeeName = cell.dataset.employee;
        const month = parseInt(cell.dataset.month, 10);

        if (leavesData[employeeName]) {
            // Filtruj urlopy, usuwając te, które w całości lub częściowo przypadają na dany miesiąc
            leavesData[employeeName] = leavesData[employeeName].filter(period => {
                const start = new Date(period.startDate);
                const end = new Date(period.endDate);
                return start.getMonth() !== month && end.getMonth() !== month;
            });
        }

        renderLeaveBlocks();
        saveLeavesData();
        undoManager.pushState(getCurrentTableState());
    };

    contextClearCell.addEventListener('click', () => {
        if (activeCell) {
            clearCellContent(activeCell);
        }
        contextMenu.classList.remove('visible');
    });

    contextOpenCalendar.addEventListener('click', () => {
        if (activeCell) {
            openModal(activeCell);
        }
        contextMenu.classList.remove('visible');
    });

    calendarGrid.addEventListener('click', (event) => {
        const target = event.target;
        if (!target.classList.contains('day-cell-calendar') || target.classList.contains('empty')) return;
        
        const clickedDate = new Date(target.dataset.date);

        if (!selectedDateRange.start) {
            // First click: set start date
            selectedDateRange.start = clickedDate;
        } else if (!selectedDateRange.end) {
            // Second click: set end date
            if (clickedDate < selectedDateRange.start) {
                selectedDateRange.end = selectedDateRange.start;
                selectedDateRange.start = clickedDate;
            } else {
                selectedDateRange.end = clickedDate;
            }
        } else {
            // Third click: reset and start a new selection
            selectedDateRange.start = clickedDate;
            selectedDateRange.end = null;
        }

        const date = new Date(monthAndYear.textContent.split(' ')[1], months.indexOf(monthAndYear.textContent.split(' ')[0]));
        generateCalendar(date.getFullYear(), date.getMonth());
    });

    prevMonthBtn.addEventListener('click', () => {
        const current = new Date(monthAndYear.textContent.split(' ')[1], months.indexOf(monthAndYear.textContent.split(' ')[0]));
        current.setMonth(current.getMonth() - 1);
        generateCalendar(current.getFullYear(), current.getMonth());
    });

    nextMonthBtn.addEventListener('click', () => {
        const current = new Date(monthAndYear.textContent.split(' ')[1], months.indexOf(monthAndYear.textContent.split(' ')[0]));
        current.setMonth(current.getMonth() + 1);
        generateCalendar(current.getFullYear(), current.getMonth());
    });

    confirmBtn.addEventListener('click', () => {
        if (cellForModal && selectedDateRange.start) {
            undoManager.pushState(getCurrentTableState());
            const employeeName = cellForModal.dataset.employee;
            if (!leavesData[employeeName]) {
                leavesData[employeeName] = [];
            }
            
            // If only start is selected, make it a single-day leave
            if (!selectedDateRange.end) {
                selectedDateRange.end = selectedDateRange.start;
            }

            leavesData[employeeName].push({
                startDate: selectedDateRange.start.toISOString().split('T')[0],
                endDate: selectedDateRange.end.toISOString().split('T')[0]
            });

            renderLeaveBlocks();
            saveLeavesData();
            undoManager.pushState(getCurrentTableState());
        }
        closeModal();
    });

    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (event) => {
        if (event.target === modal) closeModal();
    });

    searchInput.addEventListener('input', (event) => {
        const searchTerm = event.target.value.trim();
        filterTable(searchTerm);
        clearSearchBtn.style.display = searchTerm ? 'block' : 'none';
    });

    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearSearchBtn.style.display = 'none';
        filterTable('');
    });

    undoButton.addEventListener('click', undoLastAction);

    document.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
            event.preventDefault();
            undoLastAction();
            return;
        }

        const isEditing = document.activeElement.getAttribute('contenteditable') === 'true';

        if (isEditing) {
            if (event.key === 'Escape') exitEditMode(document.activeElement);
            if (event.key === 'Enter') {
                 event.preventDefault();
                 exitEditMode(document.activeElement);
            }
            return;
        }
        
        if (!activeCell) return;

        if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            clearCellContent(activeCell);
            return;
        }

        if (event.key === 'Enter') {
            event.preventDefault();
            enterEditMode(activeCell);
            return;
        }
        
        if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
            event.preventDefault();
            enterEditMode(activeCell, true, event.key);
            return;
        }

        let nextElement = null;
        const currentRow = activeCell.closest('tr');
        const currentIndexInRow = Array.from(currentRow.cells).indexOf(activeCell);

        switch (event.key) {
            case 'ArrowRight':
                nextElement = currentRow.cells[currentIndexInRow + 1];
                break;
            case 'ArrowLeft':
                nextElement = currentRow.cells[currentIndexInRow - 1];
                break;
            case 'ArrowDown':
                const nextRow = currentRow.nextElementSibling;
                if (nextRow) nextElement = nextRow.cells[currentIndexInRow];
                break;
            case 'ArrowUp':
                const prevRow = currentRow.previousElementSibling;
                if (prevRow) nextElement = prevRow.cells[currentIndexInRow];
                break;
        }

        if (nextElement && nextElement.classList.contains('day-cell')) {
            event.preventDefault();
            setActiveCell(nextElement);
        }
    });

    // --- FIRESTORE SAVE AND LOAD ---
    const saveLeavesData = async () => {
        try {
            await db.collection("leaves").doc("mainLeaves").set({ leavesData });
            window.showToast('Zapisano urlopy w Firestore!', 2000);
        } catch (error) {
            console.error('Błąd zapisu urlopów do Firestore:', error);
            window.showToast('Błąd zapisu urlopów!', 5000);
        }
    };
    
    const loadLeavesData = async () => {
        try {
            const docRef = db.collection("leaves").doc("mainLeaves");
            const doc = await docRef.get();
            if (doc.exists && doc.data().leavesData) {
                const rawData = doc.data().leavesData;
                let needsMigration = false;

                // Sprawdzenie i migracja danych
                Object.keys(rawData).forEach(employeeName => {
                    if (rawData[employeeName] && !Array.isArray(rawData[employeeName])) {
                        needsMigration = true;
                        const newEmployeeLeaves = [];
                        const oldEmployeeData = rawData[employeeName];
                        Object.keys(oldEmployeeData).forEach(monthIndex => {
                            const month = parseInt(monthIndex, 10);
                            const year = new Date().getFullYear();
                            const daysStr = oldEmployeeData[monthIndex];
                            
                            daysStr.split(',').forEach(part => {
                                const trimmedPart = part.trim();
                                if (trimmedPart.includes('-')) {
                                    const [startDay, endDay] = trimmedPart.split('-').map(Number);
                                    newEmployeeLeaves.push({
                                        startDate: new Date(year, month, startDay).toISOString().split('T')[0],
                                        endDate: new Date(year, month, endDay).toISOString().split('T')[0]
                                    });
                                } else if (trimmedPart) {
                                    const day = Number(trimmedPart);
                                    newEmployeeLeaves.push({
                                        startDate: new Date(year, month, day).toISOString().split('T')[0],
                                        endDate: new Date(year, month, day).toISOString().split('T')[0]
                                    });
                                }
                            });
                        });
                        rawData[employeeName] = newEmployeeLeaves;
                    }
                });

                leavesData = rawData;

                if (needsMigration) {
                    console.log("Wykryto stary format danych, przeprowadzono migrację. Zapisywanie nowego formatu...");
                    await saveLeavesData(); // Zapisz zmigrowane dane
                }

                renderLeaveBlocks();
            } else {
                leavesData = {};
            }
        } catch (error) {
            console.error("Błąd ładowania danych o urlopach z Firestore:", error);
            window.showToast("Błąd ładowania urlopów.", 5000);
            leavesData = {};
        }
    };

    // --- INICJALIZACJA ---
    const initializePage = async () => {
        generateTableHeaders();
        const employeeNames = await getEmployeeNames();
        generateTableRows(employeeNames);
        await loadLeavesData();
        undoManager.initialize(getCurrentTableState());
    };

    initializePage().catch(err => {
        console.error("Błąd inicjalizacji strony urlopów:", err);
    }).finally(() => {
        hideLoadingOverlay(loadingOverlay);
    });
});
