// تهيئة قاعدة البيانات
let db;

async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('WaleedPrintingDB', 1);
        
        request.onupgradeneeded = (event) => {
            db = event.target.result;
            
            if (!db.objectStoreNames.contains('academicYears')) {
                const yearsStore = db.createObjectStore('academicYears', { keyPath: 'year' });
                yearsStore.createIndex('year', 'year', { unique: true });
            }
            
            if (!db.objectStoreNames.contains('students')) {
                const studentsStore = db.createObjectStore('students', { keyPath: 'id' });
                studentsStore.createIndex('year_class', ['year', 'class'], { unique: false });
                studentsStore.createIndex('name', 'name', { unique: false });
            }
        };
    
        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };
    
        request.onerror = (event) => {
            reject('Error opening DB');
        };
    });
}

// تهيئة جميع عناصر التحكم
function setupEventListeners() {
    document.getElementById('importBtn').addEventListener('click', importExcelFiles);
    document.getElementById('exportBtn').addEventListener('click', exportToExcel);
    document.getElementById('backupBtn').addEventListener('click', backupData);
    document.getElementById('restoreBtn').addEventListener('click', restoreData);
    document.getElementById('resetDB').addEventListener('click', resetDatabase);
    document.getElementById('yearSelector').addEventListener('change', updateClassSelector);
    document.getElementById('classSelector').addEventListener('change', displayStudentsList);
    document.getElementById('searchInput').addEventListener('input', searchStudents);
    document.getElementById('editBtn').addEventListener('click', enableEditMode);
    document.getElementById('saveEditBtn').addEventListener('click', saveStudentData);
    document.getElementById('printSingleBtn').addEventListener('click', printSingleStudent);
    document.getElementById('printAllBtn').addEventListener('click', printAllStudents);
}

// وظائف المساعدة
function showLoading(message = 'جاري المعالجة...') {
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'loadingOverlay';
    loadingDiv.innerHTML = `<div>${message}</div>`;
    document.body.appendChild(loadingDiv);
}

function hideLoading() {
    const loadingDiv = document.getElementById('loadingOverlay');
    if (loadingDiv) {
        loadingDiv.remove();
    }
}

function extractYearFromFilename(filename) {
    // تحويل الأرقام العربية إلى إنجليزية إن وجدت
    const arabicToEnglish = {
        '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
        '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
    };
    
    let cleanName = filename.replace(/[٠١٢٣٤٥٦٧٨٩]/g, m => arabicToEnglish[m]);
    
    // البحث عن السنة بعد نقطة أو قبل امتداد الملف
    const yearMatch = cleanName.match(/(?:\.|سنة|عام)?(20\d{2})/);
    
    return yearMatch ? yearMatch[1] : 'غير معروف';
}

// استيراد/تصدير البيانات
async function importExcelFiles() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx, .xls';
    input.multiple = true;
    
    input.onchange = async (e) => {
        const files = Array.from(e.target.files);
        showLoading('جاري استيراد الملفات...');
        
        try {
            for (const file of files) {
                try {
                    console.log("جاري معالجة الملف:", file.name);
                    const data = await readExcelFile(file);
                    const year = extractYearFromFilename(file.name);
                    await processExcelData(data, file.name, year);
                } catch (error) {
                    console.error('Error processing file:', file.name, error);
                }
            }
            
            alert('تم استيراد البيانات بنجاح!');
            updateYearSelector();
            
            setTimeout(() => {
                updateYearSelector();
                document.getElementById('yearSelector').selectedIndex = 0;
            }, 300);
            
        } catch (error) {
            console.error('Error:', error);
            alert('حدث خطأ أثناء الاستيراد: ' + error.message);
        } finally {
            hideLoading();
        }
    };
    
    input.click();
}

async function readExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            resolve(workbook);
        };
        
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
}

async function processExcelData(workbook, fileName, year) {
    console.log("السنة المستخرجة:", year);
    
    workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet);
        
        console.log(`معالجة شيت: ${sheetName}، عدد الطلاب: ${data.length}`);
        
        let className = 'غير معروف';
        const classMatch = sheetName.match(/الصف (\S+)/) || sheetName.match(/صف (\S+)/) || sheetName.match(/class (\S+)/i);
        if (classMatch) {
            className = classMatch[1];
        }
        
        if (data.length > 0) {
            saveStudentsData(data, year, className);
        } else {
            console.warn(`الشيت ${sheetName} لا يحتوي على بيانات`);
        }
    });
}

async function saveStudentsData(students, year, className) {
    const transaction = db.transaction(['students', 'academicYears'], 'readwrite');
    const studentsStore = transaction.objectStore('students');
    const yearsStore = transaction.objectStore('academicYears');
    
    await yearsStore.put({ year, classes: [] });
    
    students.forEach((student, index) => {
        const studentId = `${year}_${className}_${index}`;
        const studentData = {
            id: studentId,
            year,
            class: className,
            name: student['اسم الطالب'] || student['الاسم'] || 'غير معروف',
            number: student['رقم الطالب'] || index + 1,
            subjects: {}
        };
        
        Object.keys(student).forEach(key => {
            if (key !== 'اسم الطالب' && key !== 'الاسم' && key !== 'رقم الطالب') {
                studentData.subjects[key] = student[key];
            }
        });
        
        studentsStore.put(studentData);
    });
}

async function exportToExcel() {
    const year = document.getElementById('yearSelector').value;
    const className = document.getElementById('classSelector').value;
    
    if (!year || !className) {
        alert('الرجاء اختيار السنة والصف الدراسي أولاً');
        return;
    }

    const workbook = XLSX.utils.book_new();
    const transaction = db.transaction(['students'], 'readonly');
    const store = transaction.objectStore('students');
    const index = store.index('year_class');
    const request = index.getAll(IDBKeyRange.only([year, className]));

    request.onsuccess = (event) => {
        const students = event.target.result;
        if (students.length === 0) {
            alert('لا توجد بيانات للتصدير');
            return;
        }

        const exportData = students.map(student => {
            const row = {
                'رقم الطالب': student.number,
                'اسم الطالب': student.name
            };

            Object.entries(student.subjects).forEach(([subject, grade]) => {
                row[subject] = grade;
            });

            return row;
        });

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        XLSX.utils.book_append_sheet(workbook, worksheet, `الصف ${className}`);
        XLSX.writeFile(workbook, `كشوفات_${year}_الصف_${className}.xlsx`);
    };

    request.onerror = (event) => {
        console.error('Error exporting data:', event.target.error);
        alert('حدث خطأ أثناء تصدير البيانات');
    };
}

// إدارة البيانات
async function updateYearSelector() {
    const yearSelector = document.getElementById('yearSelector');
    yearSelector.innerHTML = '<option value="">اختر السنة الدراسية</option>';
    
    const transaction = db.transaction('academicYears', 'readonly');
    const store = transaction.objectStore('academicYears');
    const request = store.getAll();
    
    request.onsuccess = (event) => {
        const years = event.target.result;
        console.log("السنوات المسترجعة من DB:", years);
        
        if (years.length === 0) {
            console.warn("لا توجد سنوات في قاعدة البيانات");
            return;
        }
        
        years.forEach(year => {
            const option = document.createElement('option');
            option.value = year.year;
            option.textContent = year.year;
            yearSelector.appendChild(option);
        });
        
        if (years.some(y => y.year === 'غير معروف')) {
            const option = document.createElement('option');
            option.value = 'غير معروف';
            option.textContent = 'غير معروف';
            yearSelector.appendChild(option);
        }
    };
    
    request.onerror = (event) => {
        console.error("Error fetching years:", event.target.error);
    };
}

async function updateClassSelector() {
    const yearSelector = document.getElementById('yearSelector');
    const classSelector = document.getElementById('classSelector');
    const selectedYear = yearSelector.value;
    
    classSelector.innerHTML = '<option value="">اختر الصف الدراسي</option>';
    classSelector.disabled = !selectedYear;
    
    if (!selectedYear) return;
    
    const transaction = db.transaction('students', 'readonly');
    const store = transaction.objectStore('students');
    const index = store.index('year_class');
    const request = index.getAll(IDBKeyRange.only([selectedYear]));
    
    request.onsuccess = (event) => {
        const students = event.target.result;
        const classes = [...new Set(students.map(s => s.class))];
        
        classes.forEach(className => {
            const option = document.createElement('option');
            option.value = className;
            option.textContent = `الصف ${className}`;
            classSelector.appendChild(option);
        });
    };
}

async function displayStudentsList() {
    const year = document.getElementById('yearSelector').value;
    const className = document.getElementById('classSelector').value;
    
    if (!year || !className) return;
    
    const transaction = db.transaction('students', 'readonly');
    const store = transaction.objectStore('students');
    const index = store.index('year_class');
    const request = index.getAll(IDBKeyRange.only([year, className]));
    
    request.onsuccess = (event) => {
        const students = event.target.result;
        const studentsList = document.getElementById('studentsList');
        studentsList.innerHTML = '';
        
        if (students.length === 0) {
            studentsList.innerHTML = '<div class="no-results">لا توجد بيانات لعرضها</div>';
            return;
        }
        
        students.forEach(student => {
            const studentCard = document.createElement('div');
            studentCard.className = 'student-card';
            studentCard.innerHTML = `
                <strong>${student.number}</strong> - ${student.name}
            `;
            studentCard.addEventListener('click', () => displayStudentDetails(student));
            studentsList.appendChild(studentCard);
        });
    };
}

function searchStudents() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const type = document.getElementById('searchType').value;
    
    if (searchTerm.length < (type === 'number' ? 1 : 2)) {
        displayStudentsList();
        return;
    }
    
    const transaction = db.transaction('students', 'readonly');
    const store = transaction.objectStore('students');
    const request = store.getAll();
    
    request.onsuccess = (event) => {
        const allStudents = event.target.result;
        let filteredStudents = [];
        
        if (type === 'name') {
            filteredStudents = allStudents.filter(student => 
                student.name.toLowerCase().includes(searchTerm)
            );
        } else if (type === 'number') {
            filteredStudents = allStudents.filter(student => 
                student.number.toString().includes(searchTerm)
            );
        } else if (type === 'subject') {
            filteredStudents = allStudents.filter(student => 
                Object.keys(student.subjects).some(subject => 
                    subject.toLowerCase().includes(searchTerm))
            );
        }
        
        displaySearchResults(filteredStudents);
    };
}

function displaySearchResults(students) {
    const studentsList = document.getElementById('studentsList');
    studentsList.innerHTML = '';
    
    if (students.length === 0) {
        studentsList.innerHTML = '<div class="no-results">لا توجد نتائج مطابقة</div>';
        return;
    }
    
    students.forEach(student => {
        const studentCard = document.createElement('div');
        studentCard.className = 'student-card';
        studentCard.innerHTML = `
            <strong>${student.year} - الصف ${student.class}</strong><br>
            <strong>${student.number}</strong> - ${student.name}
            <div class="student-subjects">${Object.keys(student.subjects).join(', ')}</div>
        `;
        studentCard.addEventListener('click', () => {
            document.getElementById('yearSelector').value = student.year;
            updateClassSelector().then(() => {
                document.getElementById('classSelector').value = student.class;
                displayStudentsList();
                setTimeout(() => displayStudentDetails(student), 100);
            });
        });
        studentsList.appendChild(studentCard);
    });
}

function displayStudentDetails(student) {
    document.getElementById('studentNumber').textContent = `رقم الطالب: ${student.number}`;
    document.getElementById('studentName').textContent = student.name;
    
    const tableBody = document.querySelector('#subjectsTable tbody');
    tableBody.innerHTML = '';
    
    Object.entries(student.subjects).forEach(([subject, grade]) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${subject}</td>
            <td>${grade}</td>
        `;
        tableBody.appendChild(row);
    });
    
    document.getElementById('studentDetails').style.display = 'block';
}

// التعديل والحذف
function enableEditMode() {
    const tableBody = document.querySelector('#subjectsTable tbody');
    const rows = tableBody.querySelectorAll('tr');
    
    rows.forEach(row => {
        const gradeCell = row.cells[1];
        gradeCell.contentEditable = true;
        gradeCell.style.backgroundColor = '#ffffcc';
    });
    
    document.getElementById('saveEditBtn').style.display = 'inline-block';
    document.getElementById('editBtn').style.display = 'none';
}

async function saveStudentData() {
    const studentNumber = document.getElementById('studentNumber').textContent.replace('رقم الطالب: ', '');
    const year = document.getElementById('yearSelector').value;
    const className = document.getElementById('classSelector').value;
    
    const tableBody = document.querySelector('#subjectsTable tbody');
    const rows = tableBody.querySelectorAll('tr');
    const updatedSubjects = {};
    
    rows.forEach(row => {
        const subject = row.cells[0].textContent;
        const grade = row.cells[1].textContent;
        updatedSubjects[subject] = grade;
    });
    
    const transaction = db.transaction(['students'], 'readwrite');
    const store = transaction.objectStore('students');
    const request = store.get(`${year}_${className}_${studentNumber}`);
    
    request.onsuccess = (event) => {
        const studentData = event.target.result;
        if (studentData) {
            studentData.subjects = updatedSubjects;
            store.put(studentData);
        }
    };
    
    transaction.oncomplete = () => {
        alert('تم حفظ التعديلات بنجاح');
        disableEditMode();
    };
    
    transaction.onerror = (event) => {
        console.error('Error saving student data:', event.target.error);
        alert('حدث خطأ أثناء حفظ التعديلات');
    };
}

function disableEditMode() {
    const tableBody = document.querySelector('#subjectsTable tbody');
    const rows = tableBody.querySelectorAll('tr');
    
    rows.forEach(row => {
        const gradeCell = row.cells[1];
        gradeCell.contentEditable = false;
        gradeCell.style.backgroundColor = '';
    });
    
    document.getElementById('saveEditBtn').style.display = 'none';
    document.getElementById('editBtn').style.display = 'inline-block';
}

async function deleteAcademicYear() {
    const year = document.getElementById('yearSelector').value;
    if (!year) {
        alert('الرجاء اختيار السنة الدراسية أولاً');
        return;
    }

    if (!confirm(`هل أنت متأكد من حذف السنة الدراسية ${year} وجميع بيانات الطلاب المرتبطة بها؟`)) {
        return;
    }

    const transaction = db.transaction(['students', 'academicYears'], 'readwrite');
    const studentsStore = transaction.objectStore('students');
    const yearsStore = transaction.objectStore('academicYears');

    const index = studentsStore.index('year_class');
    const request = index.openCursor(IDBKeyRange.only([year]));

    request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
            studentsStore.delete(cursor.primaryKey);
            cursor.continue();
        }
    };

    yearsStore.delete(year);

    transaction.oncomplete = () => {
        alert(`تم حذف السنة الدراسية ${year} وجميع بيانات الطلاب المرتبطة بها`);
        updateYearSelector();
        document.getElementById('studentsList').innerHTML = '<div class="no-results">لا توجد بيانات لعرضها</div>';
        document.getElementById('studentDetails').style.display = 'none';
    };

    transaction.onerror = (event) => {
        console.error('Error deleting year:', event.target.error);
        alert('حدث خطأ أثناء محاولة حذف السنة الدراسية');
    };
}

async function deleteClass() {
    const year = document.getElementById('yearSelector').value;
    const className = document.getElementById('classSelector').value;
    
    if (!year || !className) {
        alert('الرجاء اختيار السنة والصف الدراسي أولاً');
        return;
    }

    if (!confirm(`هل أنت متأكد من حذف الصف ${className} من السنة ${year} وجميع بيانات طلابه؟`)) {
        return;
    }

    const transaction = db.transaction(['students'], 'readwrite');
    const studentsStore = transaction.objectStore('students');
    const index = studentsStore.index('year_class');
    const request = index.openCursor(IDBKeyRange.only([year, className]));

    request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
            studentsStore.delete(cursor.primaryKey);
            cursor.continue();
        }
    };

    transaction.oncomplete = () => {
        alert(`تم حذف الصف ${className} من السنة ${year} وجميع بيانات طلابه`);
        updateClassSelector();
        document.getElementById('studentsList').innerHTML = '<div class="no-results">لا توجد بيانات لعرضها</div>';
        document.getElementById('studentDetails').style.display = 'none';
    };

    transaction.onerror = (event) => {
        console.error('Error deleting class:', event.target.error);
        alert('حدث خطأ أثناء محاولة حذف الصف الدراسي');
    };
}

// النسخ الاحتياطي والاستعادة
async function backupData() {
    const transaction = db.transaction(['students', 'academicYears'], 'readonly');
    const studentsStore = transaction.objectStore('students');
    const yearsStore = transaction.objectStore('academicYears');
    
    const studentsRequest = studentsStore.getAll();
    const yearsRequest = yearsStore.getAll();
    
    const [students, years] = await Promise.all([
        new Promise(resolve => { studentsRequest.onsuccess = (e) => resolve(e.target.result); }),
        new Promise(resolve => { yearsRequest.onsuccess = (e) => resolve(e.target.result); })
    ]);
    
    const backup = {
        version: 1,
        date: new Date().toISOString(),
        students,
        years
    };
    
    const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `waleed_printing_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
}

async function restoreData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        if (!confirm('تحذير: سيتم استبدال جميع البيانات الحالية بالبيانات الجديدة. هل تريد المتابعة؟')) {
            return;
        }
        
        try {
            showLoading('جاري استعادة البيانات...');
            const content = await file.text();
            const backup = JSON.parse(content);
            
            if (!backup.students || !backup.years) {
                throw new Error('ملف النسخة الاحتياطية غير صالح');
            }
            
            const transaction = db.transaction(['students', 'academicYears'], 'readwrite');
            const studentsStore = transaction.objectStore('students');
            const yearsStore = transaction.objectStore('academicYears');
            
            studentsStore.clear();
            yearsStore.clear();
            
            backup.years.forEach(year => yearsStore.put(year));
            backup.students.forEach(student => studentsStore.put(student));
            
            transaction.oncomplete = () => {
                alert('تم استعادة البيانات بنجاح');
                updateYearSelector();
                hideLoading();
            };
            
            transaction.onerror = (event) => {
                throw event.target.error;
            };
        } catch (error) {
            console.error('Error restoring backup:', error);
            alert('حدث خطأ أثناء استعادة البيانات: ' + error.message);
            hideLoading();
        }
    };
    
    input.click();
}

async function resetDatabase() {
    if (confirm("هل أنت متأكد من إعادة تعيين قاعدة البيانات؟ سيتم حذف جميع البيانات!")) {
        indexedDB.deleteDatabase('WaleedPrintingDB').onsuccess = () => {
            alert("تم إعادة تعيين قاعدة البيانات بنجاح");
            location.reload();
        };
    }
}

// الطباعة
async function printSingleStudent() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setProperties({
        title: `نتيجة الطالب - ${document.getElementById('studentName').textContent}`,
        subject: 'كشف درجات الطالب',
        author: 'تطبيق الوليد للطباعة'
    });
    
    const schoolLogo = document.getElementById('schoolLogo');
    if (schoolLogo && schoolLogo.files.length > 0) {
        const logoUrl = URL.createObjectURL(schoolLogo.files[0]);
        await addImageToPDF(doc, logoUrl, 10, 10, 30, 30);
    }
    
    doc.setFontSize(18);
    doc.setTextColor(40);
    doc.text('كشف درجات الطالب', 105, 20, { align: 'center' });
    
    doc.setFontSize(14);
    doc.text(document.getElementById('studentNumber').textContent, 105, 30, { align: 'center' });
    doc.text(document.getElementById('studentName').textContent, 105, 38, { align: 'center' });
    
    const printDate = new Date().toLocaleDateString('ar-EG');
    doc.setFontSize(10);
    doc.text(`تاريخ الطباعة: ${printDate}`, 190, 10, { align: 'right' });
    
    const subjects = [];
    const rows = document.querySelectorAll('#subjectsTable tbody tr');
    
    rows.forEach(row => {
        const subject = row.cells[0].textContent;
        const grade = row.cells[1].textContent;
        subjects.push([subject, grade]);
    });
    
    doc.autoTable({
        startY: 50,
        head: [['المادة', 'الدرجة']],
        body: subjects,
        styles: { 
            halign: 'right',
            font: 'aealarabiya',
            fontSize: 12
        },
        headStyles: { 
            fillColor: [76, 175, 80],
            textColor: [255, 255, 255],
            fontStyle: 'bold'
        },
        alternateRowStyles: {
            fillColor: [240, 240, 240]
        },
        margin: { top: 50 }
    });
    
    const principalName = document.getElementById('principalName').value;
    if (principalName) {
        doc.setFontSize(12);
        doc.text(`مدير المدرسة: ${principalName}`, 20, doc.lastAutoTable.finalY + 20);
        doc.setDrawColor(150);
        doc.line(20, doc.lastAutoTable.finalY + 25, 60, doc.lastAutoTable.finalY + 25);
    }
    
    const fileName = prompt('أدخل اسم ملف PDF للحفظ:', `نتيجة_${document.getElementById('studentName').textContent}`);
    if (fileName) {
        doc.save(`${fileName}.pdf`);
    }
}

async function printAllStudents() {
    const year = document.getElementById('yearSelector').value;
    const className = document.getElementById('classSelector').value;
    const principalName = document.getElementById('principalName').value;
    
    if (!year || !className) {
        alert('الرجاء اختيار السنة والصف أولاً');
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const transaction = db.transaction('students', 'readonly');
    const store = transaction.objectStore('students');
    const index = store.index('year_class');
    const request = index.getAll(IDBKeyRange.only([year, className]));
    
    request.onsuccess = async (event) => {
        const students = event.target.result;
        
        for (let i = 0; i < students.length; i++) {
            const student = students[i];
            
            if (i > 0) {
                doc.addPage();
            }
            
            doc.setFontSize(16);
            doc.text(`رقم الطالب: ${student.number}`, 105, 20, { align: 'center' });
            doc.text(student.name, 105, 30, { align: 'center' });
            
            const subjects = Object.entries(student.subjects).map(([subject, grade]) => [subject, grade]);
            
            doc.autoTable({
                startY: 40,
                head: [['المادة', 'الدرجة']],
                body: subjects,
                styles: { halign: 'right' },
                headStyles: { fillColor: [76, 175, 80] }
            });
            
            if (principalName) {
                doc.setFontSize(12);
                doc.text(`مدير المدرسة: ${principalName}`, 20, doc.lastAutoTable.finalY + 20);
            }
        }
        
        const fileName = prompt('أدخل اسم ملف PDF للحفظ:', `نتائج_${year}_الصف_${className}`);
        if (fileName) {
            doc.save(`${fileName}.pdf`);
        }
    };
}

async function addImageToPDF(doc, imageUrl, x, y, width, height) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            doc.addImage(img, 'JPEG', x, y, width, height);
            resolve();
        };
        img.src = imageUrl;
    });
}

// بدء تشغيل التطبيق
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initDB();
        setupEventListeners();
        updateYearSelector();
    } catch (error) {
        console.error('Failed to initialize app:', error);
        alert('حدث خطأ في تهيئة التطبيق: ' + error.message);
    }
});
