// البيانات المخزنة محلياً
let studentData = JSON.parse(localStorage.getItem('studentData')) || {};
let currentStudentIndex = null;
let currentView = 'dashboard';
let currentPage = 1;
const studentsPerPage = 10;

// عناصر DOM
const menuItems = document.querySelectorAll('.main-menu li');
const sections = document.querySelectorAll('.section');
const yearsList = document.getElementById('years-list');
const filterYear = document.getElementById('filter-year');
const filterClass = document.getElementById('filter-class');
const searchStudent = document.getElementById('search-student');
const studentsTable = document.getElementById('students-table').querySelector('tbody');
const pagination = document.getElementById('pagination');
const studentForm = document.getElementById('student-form');
const studentViewSection = document.getElementById('student-view-section');
const importSection = document.getElementById('import-section');
const excelFileInput = document.getElementById('excel-file');
const startImportBtn = document.getElementById('start-import');
const importProgress = document.getElementById('import-progress');
const importSummary = document.getElementById('import-summary');
const { jsPDF } = window.jspdf;

// تهيئة التطبيق
document.addEventListener('DOMContentLoaded', () => {
    // تعيين سنة التذييل
    document.getElementById('footer-year').textContent = new Date().getFullYear();
    
    // تحميل البيانات
    loadData();
    
    // أحداث القائمة
    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            const sectionId = item.getAttribute('data-section') + '-section';
            showSection(sectionId);
            currentView = item.getAttribute('data-section');
            
            // تحديث العنصر النشط في القائمة
            menuItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            // إذا كانت قسم الطلاب، قم بتحديث الجدول
            if (currentView === 'students') {
                updateStudentsTable();
            }
        });
    });
    
    // أحداث الأزرار
    document.getElementById('import-data-btn').addEventListener('click', () => {
        showSection('import-section');
    });
    
    document.getElementById('add-student-btn').addEventListener('click', () => {
        showStudentForm();
    });
    
    document.getElementById('back-to-list').addEventListener('click', () => {
        showSection('students-section');
    });
    
    document.getElementById('back-to-list-from-view').addEventListener('click', () => {
        showSection('students-section');
    });
    
    document.getElementById('cancel-import').addEventListener('click', () => {
        showSection('dashboard-section');
    });
    
    document.getElementById('finish-import').addEventListener('click', () => {
        showSection('dashboard-section');
        updateDashboardStats();
    });
    
    document.getElementById('edit-current-student').addEventListener('click', () => {
        if (currentStudentIndex) {
            const [year, className, index] = currentStudentIndex.split(',');
            editStudent(year, className, parseInt(index));
        }
    });
    
    // أحداث الفلاتر
    filterYear.addEventListener('change', () => {
        updateClassFilter();
        updateStudentsTable();
    });
    
    filterClass.addEventListener('change', () => {
        updateStudentsTable();
    });
    
    searchStudent.addEventListener('input', () => {
        updateStudentsTable();
    });
    
    // حدث اختيار ملف Excel
    excelFileInput.addEventListener('change', () => {
        startImportBtn.disabled = !excelFileInput.files[0];
    });
    
    // حدث بدء الاستيراد
    startImportBtn.addEventListener('click', importExcelData);
    
    // حدث حفظ الطالب
    studentForm.addEventListener('submit', saveStudent);
    
    // حدث طباعة بيانات الطالب
    document.getElementById('print-student-btn').addEventListener('click', printStudentToPDF);
});

// تحميل البيانات
function loadData() {
    updateDashboardStats();
    updateYearFilters();
    updateYearsList();
    updateStudentsTable();
}

// عرض قسم معين
function showSection(sectionId) {
    sections.forEach(section => {
        section.classList.remove('active');
    });
    
    document.getElementById(sectionId).classList.add('active');
}

// تحديث إحصائيات لوحة التحكم
function updateDashboardStats() {
    let totalStudents = 0;
    let totalClasses = 0;
    
    Object.keys(studentData).forEach(year => {
        totalClasses += Object.keys(studentData[year]).length;
        Object.keys(studentData[year]).forEach(className => {
            totalStudents += studentData[year][className].length;
        });
    });
    
    document.getElementById('total-students').textContent = totalStudents;
    document.getElementById('total-classes').textContent = totalClasses;
    document.getElementById('total-years').textContent = Object.keys(studentData).length;
    
    // تحديث النشاط الأخير
    updateRecentActivity();
}

// تحديث قائمة السنوات في الجانب
function updateYearsList() {
    yearsList.innerHTML = '';
    
    if (Object.keys(studentData).length === 0) {
        yearsList.innerHTML = '<p class="no-data">لا توجد بيانات</p>';
        return;
    }
    
    Object.keys(studentData).forEach(year => {
        const yearItem = document.createElement('div');
        yearItem.className = 'year-item';
        yearItem.innerHTML = `
            <i class="fas fa-calendar"></i>
            <span>${year}</span>
            <span class="badge">${Object.keys(studentData[year]).length} صفوف</span>
        `;
        
        yearItem.addEventListener('click', () => {
            document.querySelectorAll('.year-item').forEach(item => {
                item.classList.remove('active');
            });
            yearItem.classList.add('active');
            showSection('students-section');
            filterYear.value = year;
            updateClassFilter();
            updateStudentsTable();
        });
        
        yearsList.appendChild(yearItem);
    });
}

// تحديث فلاتر السنة والصف
function updateYearFilters() {
    filterYear.innerHTML = '<option value="">كل السنوات</option>';
    filterClass.innerHTML = '<option value="">كل الصفوف</option>';
    
    Object.keys(studentData).forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        filterYear.appendChild(option);
    });
}

// تحديث فلتر الصفوف بناءً على السنة المختارة
function updateClassFilter() {
    const year = filterYear.value;
    filterClass.innerHTML = '<option value="">كل الصفوف</option>';
    filterClass.disabled = !year;
    
    if (year) {
        Object.keys(studentData[year]).forEach(className => {
            const option = document.createElement('option');
            option.value = className;
            option.textContent = className;
            filterClass.appendChild(option);
        });
    }
}

// تحديث جدول الطلاب
function updateStudentsTable() {
    const year = filterYear.value;
    const className = filterClass.value;
    const searchTerm = searchStudent.value.toLowerCase();
    
    let allStudents = [];
    
    // جمع جميع الطلاب بناءً على الفلاتر
    if (year) {
        if (className) {
            allStudents = studentData[year][className].map((student, index) => ({
                ...student,
                year,
                className,
                index
            }));
        } else {
            Object.keys(studentData[year]).forEach(cls => {
                allStudents = allStudents.concat(
                    studentData[year][cls].map((student, index) => ({
                        ...student,
                        year,
                        className: cls,
                        index
                    }))
                );
            });
        }
    } else {
        Object.keys(studentData).forEach(yr => {
            Object.keys(studentData[yr]).forEach(cls => {
                allStudents = allStudents.concat(
                    studentData[yr][cls].map((student, index) => ({
                        ...student,
                        year: yr,
                        className: cls,
                        index
                    }))
                );
            });
        });
    }
    
    // تطبيق البحث
    if (searchTerm) {
        allStudents = allStudents.filter(student => 
            student.name.toLowerCase().includes(searchTerm)
        );
    }
    
    // التقسيم إلى صفحات
    const totalPages = Math.ceil(allStudents.length / studentsPerPage);
    currentPage = Math.min(currentPage, totalPages || 1);
    
    const startIndex = (currentPage - 1) * studentsPerPage;
    const paginatedStudents = allStudents.slice(startIndex, startIndex + studentsPerPage);
    
    // عرض الطلاب
    studentsTable.innerHTML = '';
    
    if (paginatedStudents.length === 0) {
        studentsTable.innerHTML = `
            <tr>
                <td colspan="12" class="no-data">لا توجد بيانات متاحة</td>
            </tr>
        `;
    } else {
        paginatedStudents.forEach((student, i) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${startIndex + i + 1}</td>
                <td>${student.name}</td>
                <td>${student.className}</td>
                <td>${getGradeValue(student, 'quran')}</td>
                <td>${getGradeValue(student, 'islamic')}</td>
                <td>${getGradeValue(student, 'arabic')}</td>
                <td>${getGradeValue(student, 'english')}</td>
                <td>${getGradeValue(student, 'math')}</td>
                <td>${getGradeValue(student, 'science')}</td>
                <td>${getGradeValue(student, 'social')}</td>
                <td>${getGradeValue(student, 'behavior')}</td>
                <td>
                    <button class="btn-view" data-year="${student.year}" data-class="${student.className}" data-index="${student.index}">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn-edit" data-year="${student.year}" data-class="${student.className}" data-index="${student.index}">
                        <i class="fas fa-edit"></i>
                    </button>
                </td>
            `;
            
            // أحداث الأزرار
            tr.querySelector('.btn-view').addEventListener('click', () => {
                viewStudent(student.year, student.className, student.index);
            });
            
            tr.querySelector('.btn-edit').addEventListener('click', () => {
                editStudent(student.year, student.className, student.index);
            });
            
            studentsTable.appendChild(tr);
        });
    }
    
    // تحديث أرقام الصفحات
    updatePagination(allStudents.length);
}

// الحصول على قيمة الدرجة
function getGradeValue(student, subject) {
    if (!student.grades) return '--';
    
    const grade = student.grades.find(g => g.subject === subject);
    return grade ? grade.score : '--';
}

// تحديث أرقام الصفحات
function updatePagination(totalStudents) {
    const totalPages = Math.ceil(totalStudents / studentsPerPage);
    pagination.innerHTML = '';
    
    if (totalPages <= 1) return;
    
    // زر الصفحة السابقة
    const prevLi = document.createElement('li');
    prevLi.innerHTML = `<a href="#" class="page-link"><i class="fas fa-chevron-right"></i></a>`;
    prevLi.classList.add('page-item');
    if (currentPage === 1) prevLi.classList.add('disabled');
    
    prevLi.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentPage > 1) {
            currentPage--;
            updateStudentsTable();
        }
    });
    
    pagination.appendChild(prevLi);
    
    // أرقام الصفحات
    for (let i = 1; i <= totalPages; i++) {
        const li = document.createElement('li');
        li.innerHTML = `<a href="#" class="page-link">${i}</a>`;
        li.classList.add('page-item');
        if (i === currentPage) li.classList.add('active');
        
        li.addEventListener('click', (e) => {
            e.preventDefault();
            currentPage = i;
            updateStudentsTable();
        });
        
        pagination.appendChild(li);
    }
    
    // زر الصفحة التالية
    const nextLi = document.createElement('li');
    nextLi.innerHTML = `<a href="#" class="page-link"><i class="fas fa-chevron-left"></i></a>`;
    nextLi.classList.add('page-item');
    if (currentPage === totalPages) nextLi.classList.add('disabled');
    
    nextLi.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentPage < totalPages) {
            currentPage++;
            updateStudentsTable();
        }
    });
    
    pagination.appendChild(nextLi);
}

// عرض نموذج إضافة طالب
function showStudentForm() {
    document.getElementById('form-title').textContent = 'إضافة طالب جديد';
    document.getElementById('student-index').value = '';
    
    // تعبئة قائمة السنوات
    const yearSelect = document.getElementById('form-year');
    yearSelect.innerHTML = '<option value="">اختر السنة الدراسية</option>';
    
    Object.keys(studentData).forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        yearSelect.appendChild(option);
    });
    
    // إعادة تعيين النموذج
    studentForm.reset();
    showSection('student-form-section');
}

// عرض بيانات طالب
function viewStudent(year, className, index) {
    const student = studentData[year][className][index];
    currentStudentIndex = `${year},${className},${index}`;
    
    // تعبئة البيانات
    document.getElementById('student-number').textContent = `الرقم: ${index + 1}`;
    document.getElementById('student-name-view').textContent = student.name;
    document.getElementById('student-class-view').innerHTML = `<i class="fas fa-chalkboard"></i> الصف: ${className}`;
    document.getElementById('student-year-view').innerHTML = `<i class="fas fa-calendar-alt"></i> السنة: ${year}`;
    document.getElementById('student-id-view').textContent = student.id || '--';
    document.getElementById('student-birthdate-view').textContent = student.birthdate || '--';
    document.getElementById('student-address-view').textContent = student.address || '--';
    document.getElementById('student-phone-view').textContent = student.phone || '--';
    
    // تعبئة الدرجات
    const gradesDetails = document.getElementById('grades-details');
    gradesDetails.innerHTML = '';
    
    const subjects = [
        { name: 'القرآن الكريم', key: 'quran' },
        { name: 'الإسلامية', key: 'islamic' },
        { name: 'العربية', key: 'arabic' },
        { name: 'الإنجليزية', key: 'english' },
        { name: 'الرياضيات', key: 'math' },
        { name: 'العلوم', key: 'science' },
        { name: 'الاجتماعيات', key: 'social' },
        { name: 'السلوك', key: 'behavior' }
    ];
    
    subjects.forEach(subject => {
        const grade = student.grades ? student.grades.find(g => g.subject === subject.key) : null;
        const tr = document.createElement('tr');
        
        tr.innerHTML = `
            <td>${subject.name}</td>
            <td>${grade ? grade.score : '--'}</td>
            <td>${grade ? getGradeLetter(grade.score) : '--'}</td>
            <td>${grade ? getGradeNotes(grade.score) : '--'}</td>
        `;
        
        gradesDetails.appendChild(tr);
    });
    
    // تحديث الرسم البياني
    updateGradesChart(student);
    
    showSection('student-view-section');
}

// تحويل الدرجة إلى حرف
function getGradeLetter(score) {
    if (score >= 90) return 'ممتاز';
    if (score >= 80) return 'جيد جداً';
    if (score >= 70) return 'جيد';
    if (score >= 60) return 'مقبول';
    return 'ضعيف';
}

// ملاحظات الدرجة
function getGradeNotes(score) {
    if (score >= 90) return 'أداء ممتاز';
    if (score >= 80) return 'أعلى من المتوسط';
    if (score >= 70) return 'متوسط';
    if (score >= 60) return 'أقل من المتوسط';
    return 'يحتاج إلى تحسين';
}

// تحديث الرسم البياني للدرجات
function updateGradesChart(student) {
    const ctx = document.getElementById('grades-chart').getContext('2d');
    
    const subjects = ['القرآن الكريم', 'الإسلامية', 'العربية', 'الإنجليزية', 'الرياضيات', 'العلوم', 'الاجتماعيات', 'السلوك'];
    const grades = subjects.map(subject => {
        const grade = student.grades ? student.grades.find(g => g.subject === subject.toLowerCase().replace(' ', '')) : null;
        return grade ? grade.score : 0;
    });
    
    // إذا كان هناك رسم بياني موجود، قم بتدميره أولاً
    if (window.studentChart) {
        window.studentChart.destroy();
    }
    
    window.studentChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: subjects,
            datasets: [{
                label: 'الدرجات',
                data: grades,
                backgroundColor: [
                    'rgba(52, 152, 219, 0.7)',
                    'rgba(46, 204, 113, 0.7)',
                    'rgba(155, 89, 182, 0.7)',
                    'rgba(241, 196, 15, 0.7)',
                    'rgba(230, 126, 34, 0.7)',
                    'rgba(231, 76, 60, 0.7)',
                    'rgba(26, 188, 156, 0.7)',
                    'rgba(149, 165, 166, 0.7)'
                ],
                borderColor: [
                    'rgba(52, 152, 219, 1)',
                    'rgba(46, 204, 113, 1)',
                    'rgba(155, 89, 182, 1)',
                    'rgba(241, 196, 15, 1)',
                    'rgba(230, 126, 34, 1)',
                    'rgba(231, 76, 60, 1)',
                    'rgba(26, 188, 156, 1)',
                    'rgba(149, 165, 166, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        stepSize: 20
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

// تعديل بيانات طالب
function editStudent(year, className, index) {
    const student = studentData[year][className][index];
    currentStudentIndex = `${year},${className},${index}`;
    
    document.getElementById('form-title').textContent = 'تعديل بيانات الطالب';
    document.getElementById('student-index').value = currentStudentIndex;
    
    // تعبئة البيانات
    document.getElementById('form-year').value = year;
    document.getElementById('form-class').value = className;
    document.getElementById('form-name').value = student.name;
    document.getElementById('form-id').value = student.id || '';
    document.getElementById('form-birthdate').value = student.birthdate || '';
    document.getElementById('form-address').value = student.address || '';
    document.getElementById('form-phone').value = student.phone || '';
    
    // تعبئة الدرجات
    if (student.grades) {
        student.grades.forEach(grade => {
            const input = document.getElementById(`form-${grade.subject}`);
            if (input) input.value = grade.score;
        });
    }
    
    showSection('student-form-section');
}

// حفظ بيانات الطالب
function saveStudent(e) {
    e.preventDefault();
    
    const studentIndex = document.getElementById('student-index').value;
    const year = document.getElementById('form-year').value;
    const className = document.getElementById('form-class').value;
    const name = document.getElementById('form-name').value;
    const id = document.getElementById('form-id').value;
    const birthdate = document.getElementById('form-birthdate').value;
    const address = document.getElementById('form-address').value;
    const phone = document.getElementById('form-phone').value;
    
    // جمع الدرجات
    const grades = [
        { subject: 'quran', score: document.getElementById('form-quran').value },
        { subject: 'islamic', score: document.getElementById('form-islamic').value },
        { subject: 'arabic', score: document.getElementById('form-arabic').value },
        { subject: 'english', score: document.getElementById('form-english').value },
        { subject: 'math', score: document.getElementById('form-math').value },
        { subject: 'science', score: document.getElementById('form-science').value },
        { subject: 'social', score: document.getElementById('form-social').value },
        { subject: 'behavior', score: document.getElementById('form-behavior').value }
    ].filter(grade => grade.score !== '');
    
    // إنشاء كائن الطالب
    const student = {
        name,
        id,
        birthdate,
        address,
        phone: phone || undefined,
        grades: grades.length > 0 ? grades : undefined
    };
    
    if (studentIndex) {
        // حالة التعديل
        const [oldYear, oldClassName, index] = studentIndex.split(',');
        
        if (oldYear === year && oldClassName === className) {
            // إذا لم تتغير السنة أو الصف، قم فقط بتحديث البيانات
            studentData[year][className][index] = student;
        } else {
            // إذا تغيرت السنة أو الصف، انقل الطالب إلى الموقع الجديد
            studentData[oldYear][oldClassName].splice(index, 1);
            
            // إذا أصبح الصف فارغاً، احذفه
            if (studentData[oldYear][oldClassName].length === 0) {
                delete studentData[oldYear][oldClassName];
                
                // إذا أصبحت السنة فارغة، احذفها
                if (Object.keys(studentData[oldYear]).length === 0) {
                    delete studentData[oldYear];
                }
            }
            
            // أضف الطالب إلى موقعه الجديد
            if (!studentData[year]) studentData[year] = {};
            if (!studentData[year][className]) studentData[year][className] = [];
            
            studentData[year][className].push(student);
        }
    } else {
        // حالة الإضافة
        if (!studentData[year]) studentData[year] = {};
        if (!studentData[year][className]) studentData[year][className] = [];
        
        studentData[year][className].push(student);
    }
    
    // حفظ البيانات
    localStorage.setItem('studentData', JSON.stringify(studentData));
    
    // تحديث الواجهة
    updateDashboardStats();
    updateYearFilters();
    updateYearsList();
    updateStudentsTable();
    
    // عرض رسالة نجاح
    showToast('تم حفظ بيانات الطالب بنجاح', 'success');
    
    // العودة إلى قائمة الطلاب
    showSection('students-section');
}

// استيراد بيانات من Excel
function importExcelData() {
    const file = excelFileInput.files[0];
    const yearFromInput = document.getElementById('import-year').value;
    
    if (!file) {
        showToast('الرجاء اختيار ملف Excel أولاً', 'error');
        return;
    }

    // إظهار حالة التحميل
    importProgress.classList.remove('hidden');
    importSummary.classList.add('hidden');
    document.getElementById('import-progress-bar').style.width = '0%';
    document.getElementById('import-status').textContent = 'جاري معالجة الملف...';

    const reader = new FileReader();

    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            
            let importedStudents = 0;
            let importedClasses = new Set();
            let importedYears = new Set();

            // تحديث شريط التقدم
            document.getElementById('import-progress-bar').style.width = '30%';
            document.getElementById('import-status').textContent = 'جاري قراءة البيانات...';

            // معالجة كل شيت في الملف
            workbook.SheetNames.forEach((sheetName, sheetIndex) => {
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);

                // تحديد السنة الدراسية
                const year = yearFromInput || sheetName;
                importedYears.add(year);

                if (!studentData[year]) {
                    studentData[year] = {};
                }

                // افتراض أن كل الصفوف في شيت واحد تنتمي لنفس الصف
                const className = `الصف ${sheetIndex + 1}`;
                importedClasses.add(className);

                if (!studentData[year][className]) {
                    studentData[year][className] = [];
                }

                // تحديث شريط التقدم
                document.getElementById('import-progress-bar').style.width = `${40 + (sheetIndex * 10)}%`;
                document.getElementById('import-status').textContent = `جاري معالجة الصف ${className}...`;

                // معالجة كل طالب
                jsonData.forEach((row, rowIndex) => {
                    const student = {
                        name: row['اسم الطالب'] || `طالب ${rowIndex + 1}`,
                        id: row['رقم الهوية'] || row['رقم الجلوس'] || `ID-${year}-${className}-${rowIndex}`,
                        birthdate: formatDate(row['تاريخ الميلاد']) || 'غير معروف',
                        address: row['العنوان'] || 'غير معروف',
                        phone: row['رقم الهاتف'] || '',
                        grades: []
                    };

                    // معالجة الدرجات
                    const subjects = [
                        { excelKey: 'القرآن الكريم', key: 'quran' },
                        { excelKey: 'الإسلامية', key: 'islamic' },
                        { excelKey: 'العربية', key: 'arabic' },
                        { excelKey: 'الإنجليزية', key: 'english' },
                        { excelKey: 'الرياضيات', key: 'math' },
                        { excelKey: 'العلوم', key: 'science' },
                        { excelKey: 'الاجتماعيات', key: 'social' },
                        { excelKey: 'السلوك', key: 'behavior' }
                    ];

                    subjects.forEach(subject => {
                        if (row[subject.excelKey] !== undefined) {
                            student.grades.push({
                                subject: subject.key,
                                score: parseFloat(row[subject.excelKey]) || 0
                            });
                        }
                    });

                    studentData[year][className].push(student);
                    importedStudents++;
                });
            });

            // تحديث شريط التقدم
            document.getElementById('import-progress-bar').style.width = '90%';
            document.getElementById('import-status').textContent = 'جاري حفظ البيانات...';

            // حفظ البيانات
            localStorage.setItem('studentData', JSON.stringify(studentData));

            // عرض ملخص الاستيراد
            document.getElementById('imported-students').textContent = importedStudents;
            document.getElementById('imported-classes').textContent = importedClasses.size;
            document.getElementById('imported-years').textContent = importedYears.size;

            // إخفاء شريط التقدم وإظهار الملخص
            setTimeout(() => {
                importProgress.classList.add('hidden');
                importSummary.classList.remove('hidden');
                document.getElementById('import-progress-bar').style.width = '100%';
                document.getElementById('import-status').textContent = 'تم الاستيراد بنجاح';

                // تحديث الواجهة
                updateDashboardStats();
                updateYearFilters();
                updateYearsList();
                updateStudentsTable();

                showToast(`تم استيراد ${importedStudents} طالب بنجاح`, 'success');
            }, 500);

        } catch (error) {
            importProgress.classList.add('hidden');
            showToast(`حدث خطأ أثناء الاستيراد: ${error.message}`, 'error');
            console.error('تفاصيل الخطأ:', error);
        }
    };

    reader.onerror = function() {
        importProgress.classList.add('hidden');
        showToast('حدث خطأ أثناء قراءة الملف', 'error');
    };

    reader.readAsArrayBuffer(file);
}

// دالة مساعدة لتنسيق التاريخ
function formatDate(dateValue) {
    if (!dateValue) return null;
    
    // إذا كان التاريخ كائن Date
    if (dateValue instanceof Date) {
        return dateValue.toISOString().split('T')[0];
    }
    
    // إذا كان التاريخ نصاً
    if (typeof dateValue === 'string') {
        // حاول تحويله إذا كان بتنسيق Excel (مثل 44562 لأيام منذ 1900)
        if (/^\d+$/.test(dateValue)) {
            const excelDate = parseInt(dateValue);
            const date = new Date((excelDate - 25569) * 86400 * 1000);
            return date.toISOString().split('T')[0];
        }
        
        // إذا كان بتنسيق معروف
        return dateValue;
    }
    
    return null;
}

// طباعة بيانات الطالب كـ PDF
function printStudentToPDF() {
    if (!currentStudentIndex) return;
    
    const [year, className, index] = currentStudentIndex.split(',');
    const student = studentData[year][className][index];
    
    const doc = new jsPDF();
    
    // إضافة عنوان المستند
    doc.setFontSize(18);
    doc.setTextColor(40);
    doc.text('بيانات الطالب', 105, 20, { align: 'center' });
    
    doc.setFontSize(14);
    doc.text(`السنة الدراسية: ${year}`, 15, 30);
    doc.text(`الصف: ${className}`, 15, 37);
    
    // إضافة صورة رمزية
    doc.addImage('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIj48cGF0aCBmaWxsPSIjMjE5NkYzIiBkPSJNMjU2IDBBMjU2IDI1NiAwIDEgMCAyNTYgNTEyQTI1NiAyNTYgMCAxIDAgMjU2IDBaIi8+PHBhdGggZmlsbD0iI0VFRUVFRSIgZD0iTTI1NiAxMjhDNjAgMTI4IDAgMTYwIDAgMjcyQzAgMzg0IDYwIDQxNiAyNTYgNDE2QzQ1MiA0MTYgNTEyIDM4NCA1MTIgMjcyQzUxMiAxNjAgNDUyIDEyOCAyNTYgMTI4Wk0xMjggMjg4QTMyIDMyIDAgMSAxIDEyOCAzNTJBMTYuMSAxNi4xIDAgMCAxIDExMiAzNjhBMTYuMSAxNi4xIDAgMCAxIDEyOCAzNTJBMTYuMSAxNi4xIDAgMCAxIDE0NCAzNjhBMTYuMSAxNi4xIDAgMCAxIDEyOCAzNTJaTTI1NiAzODRDMTYwIDM4NCAxMjggMzUyIDEyOCAyODhBMjQgMjQgMCAxIDEgMTI4IDI1NkMyMjQgMjU2IDI1NiAyODggMjU2IDM1MkMyNTYgNDE2IDIyNCA0NDggMTI4IDQ0OEEyNCAyNCAwIDEgMSAxMjggNDE2QzE5MiA0MTYgMjI0IDM4NCAyNTYgMzIwQzI1NiAyNTYgMjI0IDIyNCAxMjggMjI0QTI0IDI0IDAgMSAxIDEyOCAxOTJDMjI0IDE5MiAyNTYgMjI0IDI1NiAyODhDMjU2IDM1MiAyMjQgMzg0IDEyOCAzODRaIk0zODQgMjg4QTMyIDMyIDAgMSAxIDM4NCAzNTJBMTYuMSAxNi4xIDAgMCAxIDM2OCAzNjhBMTYuMSAxNi4xIDAgMCAxIDM4NCAzNTJBMTYuMSAxNi4xIDAgMCAxIDQwMCAzNjhBMTYuMSAxNi4xIDAgMCAxIDM4NCAzNTJaIi8+PC9zdmc+', 'PNG', 170, 20, 30, 30);
    
    // المعلومات الأساسية
    doc.setFontSize(16);
    doc.text('المعلومات الأساسية', 15, 60);
    
    doc.setFontSize(12);
    doc.text(`اسم الطالب: ${student.name}`, 20, 70);
    doc.text(`رقم الهوية/الجلوس: ${student.id}`, 20, 77);
    doc.text(`تاريخ الميلاد: ${student.birthdate}`, 20, 84);
    doc.text(`العنوان: ${student.address}`, 20, 91);
    doc.text(`رقم الهاتف: ${student.phone || 'غير متوفر'}`, 20, 98);
    
    // الدرجات
    doc.setFontSize(16);
    doc.text('النتائج الدراسية', 15, 115);
    
    doc.setFontSize(12);
    let y = 125;
    
    const subjects = [
        { name: 'القرآن الكريم', key: 'quran' },
        { name: 'الإسلامية', key: 'islamic' },
        { name: 'العربية', key: 'arabic' },
        { name: 'الإنجليزية', key: 'english' },
        { name: 'الرياضيات', key: 'math' },
        { name: 'العلوم', key: 'science' },
        { name: 'الاجتماعيات', key: 'social' },
        { name: 'السلوك', key: 'behavior' }
    ];
    
    subjects.forEach(subject => {
        const grade = student.grades ? student.grades.find(g => g.subject === subject.key) : null;
        const gradeText = grade ? `${grade.score} (${getGradeLetter(grade.score)})` : '--';
        doc.text(`${subject.name}: ${gradeText}`, 20, y);
        y += 7;
    });
    
    // تذييل الصفحة
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('تم الإنشاء بواسطة نظام إدارة الطلاب', 105, 285, { align: 'center' });
    doc.text(new Date().toLocaleDateString('ar-EG'), 195, 285);
    
    // حفظ الملف
    doc.save(`student_${student.name}.pdf`);
}

// تحديث النشاط الأخير
function updateRecentActivity() {
    const activityList = document.getElementById('activity-list');
    activityList.innerHTML = '';
    
    // يمكنك هنا جلب سجل النشاطات الفعلية من البيانات
    const activities = [
        { icon: 'fa-user-plus', title: 'تمت إضافة طالب جديد', description: 'علي محمد - الصف الأول أ', time: 'منذ 5 دقائق' },
        { icon: 'fa-file-import', title: 'تم استيراد بيانات', description: '25 طالباً من ملف Excel', time: 'منذ ساعة' },
        { icon: 'fa-edit', title: 'تم تعديل بيانات طالب', description: 'سارة أحمد - الصف الثاني ب', time: 'منذ 3 ساعات' },
        { icon: 'fa-file-pdf', title: 'تم إنشاء تقرير', description: 'قائمة الصف الثالث ج', time: 'منذ يوم' }
    ];
    
    activities.forEach(activity => {
        const item = document.createElement('div');
        item.className = 'activity-item';
        item.innerHTML = `
            <div class="activity-icon">
                <i class="fas ${activity.icon}"></i>
            </div>
            <div class="activity-info">
                <h4>${activity.title}</h4>
                <p>${activity.description}</p>
            </div>
            <div class="activity-time">${activity.time}</div>
        `;
        activityList.appendChild(item);
    });
}

// عرض رسالة toast
function showToast(message, type) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 300);
    }, 3000);
}