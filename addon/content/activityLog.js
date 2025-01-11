const ZoTracerActivityLog = {
    activities: [],
    collectionsChart: null,
    activityRadarChart: null,
    dbManager: null,
    sortTimeAsc: true,
    sortCountAsc: true,
    
    init: async function() {
        try {
            // Wait for Zotero to be ready
            await Promise.all([
                Zotero.initializationPromise,
                Zotero.unlockPromise,
                Zotero.uiReadyPromise,
              ]);
            
            // Wait for ZoTracer to be ready
            if (!window.Zotero.ZoTracer) {
                console.error("[ZoTracer] ZoTracer module not found");
                return;
            }
            
            // Initialize database manager
            this.dbManager = Zotero.ZoTracer.DatabaseManager.getInstance();
            await this.dbManager.init();
            
            // Initialize UI elements
            this.filterType = document.getElementById('filter-type');
            this.activityGrid = document.getElementById('activity-grid');
            this.activityList = document.getElementById('activity-list');
            this.tooltip = document.getElementById('tooltip');
            this.refreshBtn = document.getElementById('refresh-btn');
            this.timeRange = document.getElementById('time-range');
            this.customRange = document.getElementById('custom-range');
            this.dateFrom = document.getElementById('date-from');
            this.dateTo = document.getElementById('date-to');
            this.activeFilters = document.getElementById('active-filters');
            this.colorFilters = document.getElementById('color-filters');
            this.tagFilters = document.getElementById('tag-filters');
            
            // Initialize filter states
            this.activeTagFilters = new Set();
            this.activeColorFilters = new Set();
            
            // Add event listeners for tag filters
            document.querySelectorAll('.tag-filter').forEach(button => {
                button.addEventListener('click', () => {
                    const tag = button.dataset.tag;
                    button.classList.toggle('active');
                    
                    if (this.activeTagFilters.has(tag)) {
                        this.activeTagFilters.delete(tag);
                        this.removeActiveFilter(tag);
                    } else {
                        this.activeTagFilters.add(tag);
                        this.addActiveFilter(tag);
                    }
                    
                    this.updateActivityLog();
                });
            });
            
            // Add event listeners for color filters
            document.querySelectorAll('.color-filter').forEach(button => {
                button.addEventListener('click', () => {
                    const color = button.dataset.color;
                    button.classList.toggle('active');
                    
                    if (this.activeColorFilters.has(color)) {
                        this.activeColorFilters.delete(color);
                        this.removeActiveFilter(color);
                    } else {
                        this.activeColorFilters.add(color);
                        this.addActiveFilter(color, true);
                    }
                    
                    this.updateActivityLog();
                });
            });
            
            // Add event listeners for other controls
            this.filterType.addEventListener('change', () => this.updateActivityLog());
            this.refreshBtn.addEventListener('click', () => {
                console.log("[ZoTracer] Refresh button clicked");
                this.updateActivityLog(this.filterType.value);
            });
            this.timeRange.addEventListener('change', () => this.handleTimeRangeChange());
            this.dateFrom.addEventListener('change', () => this.updateActivityLog());
            this.dateTo.addEventListener('change', () => this.updateActivityLog());
            
            // Initialize sort buttons
            this.initializeSortButtons();
            
            // Add event listeners for sorting and flomo sync
            this.setupEventListeners();
            
            // Initial load
            await this.updateActivityLog(this.filterType.value);
        } catch (error) {
            console.error("[ZoTracer] Error initializing activity log:", error);
        }
    },

    addActiveFilter: function(value, isColor = false) {
        const filter = document.createElement('div');
        filter.className = 'active-filter';
        filter.dataset.value = value;
        
        if (isColor) {
            const colorDot = document.createElement('span');
            colorDot.className = 'color-dot';
            colorDot.style.backgroundColor = value;
            filter.appendChild(colorDot);
        } else {
            filter.textContent = value;
        }
        
        const remove = document.createElement('span');
        remove.className = 'remove';
        remove.textContent = '×';
        remove.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isColor) {
                this.activeColorFilters.delete(value);
                document.querySelector(`.color-filter[data-color="${value}"]`).classList.remove('active');
            } else {
                this.activeTagFilters.delete(value);
                document.querySelector(`.tag-filter[data-tag="${value}"]`).classList.remove('active');
            }
            filter.remove();
            this.updateActivityLog();
        });
        
        filter.appendChild(remove);
        this.activeFilters.appendChild(filter);
    },

    removeActiveFilter: function(value) {
        const filter = this.activeFilters.querySelector(`.active-filter[data-value="${value}"]`);
        if (filter) {
            filter.remove();
        }
    },

    updateActivityLog: async function(type) {
        console.log("[ZoTracer] Updating activity log with type:", type);
        try {
            if (!Zotero.ZoTracer?.DatabaseManager) {
                console.error("[ZoTracer] Database manager not available");
                return;
            }

            const dbManager = Zotero.ZoTracer.DatabaseManager.getInstance();
            if (!dbManager) {
                console.error("[ZoTracer] Could not get database manager instance");
                return;
            }

            const { startDate, endDate } = this.getDateRange();
            console.log("[ZoTracer] Date range:", { startDate, endDate });
            
            // Get activities from database
            this.activities = await dbManager.getActivitiesSimple();
            console.log("[ZoTracer] Retrieved activities:", this.activities.length);
            
            // Extract unique tags and colors from activities
            this.updateFilterOptions(this.activities);
            
            // Use the current filter type if none provided
            const filterType = type || this.filterType.value;
            console.log("[ZoTracer] Filtering by type:", filterType);
            
            // Filter activities
            const filteredActivities = this.activities.filter(activity => {
                const activityDate = new Date(activity.timestamp);
                const matchesDate = activityDate >= startDate && activityDate <= endDate;
                const matchesType = filterType === 'all' ? true : activity.activityType === filterType;
                
                // Check tag filters
                const matchesTags = this.activeTagFilters.size === 0 || Array.from(this.activeTagFilters).some(tag => {
                    return (activity.annotationTags && activity.annotationTags.includes(tag));
                });
                
                // Check color filters
                const matchesColors = this.activeColorFilters.size === 0 || Array.from(this.activeColorFilters).some(color => {
                    return activity.annotationColor === color;
                });
                
                return matchesDate && matchesType && matchesTags && matchesColors;
            });
            
            console.log("[ZoTracer] Filtered activities:", filteredActivities.length);

            // Sort activities by timestamp in descending order
            filteredActivities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            // Update visualizations
            this.updateActivityGrid(filteredActivities);
            this.updateCollectionsChart(filteredActivities);
            this.updateActivityRadarChart(filteredActivities);
            this.displayActivities(filteredActivities);
        } catch (error) {
            console.error("[ZoTracer] Error updating activity log:", error);
            if (this.activityList) {
                this.activityList.innerHTML = `
                    <div class="empty-message" style="color: #cf222e;">
                        Error updating activity log. Please try again.
                        <small>${error.message || ''}</small>
                    </div>
                `;
            }
        }
    },

    handleTimeRangeChange: function() {
        const value = this.timeRange.value;
        this.customRange.style.display = value === 'custom' ? 'flex' : 'none';
        this.updateActivityLog();
    },

    getDateRange: function() {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        let startDate, endDate = new Date(now.getTime());

        switch (this.timeRange.value) {
            case 'today':
                startDate = today;
                break;
            case 'week':
                startDate = new Date(today.getTime());
                startDate.setDate(startDate.getDate() - 7);
                break;
            case 'month':
                startDate = new Date(today.getTime());
                startDate.setMonth(startDate.getMonth() - 1);
                break;
            case 'custom':
                startDate = new Date(this.dateFrom.value);
                endDate = new Date(this.dateTo.value);
                endDate.setHours(23, 59, 59, 999);
                break;
            default:
                startDate = today;
        }

        return { startDate, endDate };
    },

    updateActivityGrid: function(activities) {
        if (!this.activityGrid) return;
        
        // Clear existing grid
        this.activityGrid.innerHTML = '';
        
        // Create activity map for the heatmap
        const activityMap = this.createActivityMap(activities);
        
        // Calculate date range
        const endDate = new Date();
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 364); // Go back 364 days
        
        // Adjust startDate to previous Monday
        while (startDate.getDay() !== 1) {
            startDate.setDate(startDate.getDate() - 1);
        }

        // Add month labels
        const monthLabels = document.createElement('div');
        monthLabels.className = 'month-labels';
        
        // Create month labels at fixed intervals
        const monthPositions = [0, 12, 24, 36, 48]; // Show roughly every 3 months
        monthPositions.forEach(weekIndex => {
            const labelDate = new Date(startDate);
            labelDate.setDate(labelDate.getDate() + (weekIndex * 7));
            if (labelDate <= endDate) {
                const label = document.createElement('div');
                label.className = 'month-label';
                label.textContent = labelDate.toLocaleString('default', { month: 'short' });
                label.style.gridColumn = weekIndex + 1;
                monthLabels.appendChild(label);
            }
        });
        
        this.activityGrid.appendChild(monthLabels);

        // Create grid cells
        const cells = [];
        const currentDate = new Date(startDate);
        
        // Calculate max count for color scaling
        const maxCount = Math.max(...Object.values(activityMap), 0);

        // Create cells for each week (column)
        while (currentDate <= endDate) {
            // Create cells for each day in the week (rows in current column)
            for (let day = 0; day < 7; day++) {
                const dateStr = currentDate.toISOString().split('T')[0];
                const count = activityMap[dateStr] || 0;
                const level = this.getActivityLevel(count, maxCount);
                
                const cell = document.createElement('div');
                cell.className = 'activity-cell';
                cell.style.backgroundColor = this.getColorForLevel(level);
                
                // Store date and count as data attributes
                cell.setAttribute('data-date', dateStr);
                cell.setAttribute('data-count', count);
                
                // Add hover event listeners with correct date
                const formattedDate = this.formatDate(currentDate);
                cell.title = `${count} activities on ${formattedDate}`;
                
                cell.addEventListener('mouseover', (e) => {
                    const tooltip = this.tooltip;
                    tooltip.textContent = `${count} activities on ${formattedDate}`;
                    tooltip.style.opacity = '1';
                    
                    // Get viewport dimensions
                    const viewportWidth = window.innerWidth;
                    const viewportHeight = window.innerHeight;
                    
                    // Get tooltip dimensions
                    const tooltipWidth = tooltip.offsetWidth;
                    const tooltipHeight = tooltip.offsetHeight;
                    
                    // Calculate positions
                    let left = e.pageX + 10;
                    let top = e.pageY + 10;
                    
                    // Check right edge
                    if (left + tooltipWidth > viewportWidth) {
                        left = e.pageX - tooltipWidth - 10;
                    }
                    
                    // Check bottom edge
                    if (top + tooltipHeight > viewportHeight) {
                        top = e.pageY - tooltipHeight - 10;
                    }
                    
                    // Apply positions
                    tooltip.style.left = `${left}px`;
                    tooltip.style.top = `${top}px`;
                });
                
                cell.addEventListener('mouseout', () => {
                    this.tooltip.style.opacity = '0';
                });
                
                // Add cell directly to grid in correct order
                this.activityGrid.appendChild(cell);
                
                // Move to next day
                currentDate.setDate(currentDate.getDate() + 1);
            }
        }
    },

    displayActivities: function(activities) {
        if (!this.activityList) return;
        
        // Clear existing list
        this.activityList.innerHTML = '';
        
        if (activities.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-message';
            emptyMessage.textContent = 'No activities found for the selected period';
            this.activityList.appendChild(emptyMessage);
            return;
        }

        // Group activities by article title
        const groupedByArticle = {};
        activities.forEach(activity => {
            const title = activity.articleTitle || 'Other Activities';
            if (!groupedByArticle[title]) {
                groupedByArticle[title] = {
                    activities: [],
                    lastModified: new Date(0)
                };
            }
            groupedByArticle[title].activities.push(activity);
            const activityDate = new Date(activity.timestamp);
            if (activityDate > groupedByArticle[title].lastModified) {
                groupedByArticle[title].lastModified = activityDate;
            }
        });

        // Sort articles by last modified date
        const sortedArticles = Object.entries(groupedByArticle)
            .sort(([, a], [, b]) => b.lastModified - a.lastModified);

        // Create article groups
        sortedArticles.forEach(([title, data]) => {
            const articleGroup = document.createElement('div');
            articleGroup.className = 'article-group';

            // Create header
            const header = document.createElement('div');
            header.className = 'article-header';
            
            const headerContent = document.createElement('div');
            headerContent.className = 'article-header-content';
            
            const titleEl = document.createElement('a');
            titleEl.className = 'article-title';
            titleEl.textContent = title;
            titleEl.href = '#';
            titleEl.onclick = (event) => {
                event.preventDefault();
                if (data.activities[0].articleId) {
                    Zotero.getActiveZoteroPane().selectItem(data.activities[0].articleId);
                }
            };
            
            const stats = document.createElement('div');
            stats.className = 'article-stats';
            stats.textContent = `${data.activities.length} activities · Last modified ${this.formatDate(data.lastModified)}`;
            
            headerContent.appendChild(titleEl);
            headerContent.appendChild(stats);
            
            const toggleButton = document.createElement('button');
            toggleButton.className = 'toggle-button';
            toggleButton.innerHTML = '<span class="icon">▼</span>';
            
            header.appendChild(headerContent);
            header.appendChild(toggleButton);
            
            // Create activities container
            const activitiesList = document.createElement('div');
            activitiesList.className = 'activities-list collapsed';

            // Add activities to container
            data.activities.forEach(activity => {
                const activityItem = document.createElement('div');
                activityItem.className = 'activity-item';
                
                const title = document.createElement('a');
                title.className = 'activity-title';
                title.innerHTML = this.formatActivityDescription(activity);
                title.href = '#';
                title.style.textDecoration = 'none';
                title.onclick = (event) => {
                    event.preventDefault();
                    if (activity.articleId) {
                        Zotero.getActiveZoteroPane().selectItem(activity.articleId);
                    }
                };
                
                const time = document.createElement('div');
                time.className = 'activity-time';
                time.setAttribute('data-timestamp', activity.timestamp);
                time.textContent = new Date(activity.timestamp).toLocaleString();
                
                // Add count attribute for sorting
                const count = this.getActivityCount(activity);
                activityItem.setAttribute('data-count', count);
                
                activityItem.appendChild(title);
                activityItem.appendChild(time);
                activitiesList.appendChild(activityItem);
            });

            // Add click handler for expand/collapse
            header.addEventListener('click', () => {
                activitiesList.classList.toggle('collapsed');
                toggleButton.querySelector('.icon').style.transform = 
                    activitiesList.classList.contains('collapsed') ? 'rotate(0deg)' : 'rotate(180deg)';
            });

            articleGroup.appendChild(header);
            articleGroup.appendChild(activitiesList);
            this.activityList.appendChild(articleGroup);
        });
    },

    initializeSortButtons: function() {
        const timeButton = document.getElementById('sortByTime');
        const countButton = document.getElementById('sortByCount');

        if (!timeButton || !countButton) {
            console.error('[ZoTracer] Sort buttons not found');
            return;
        }

        this.sortTimeAsc = false;
        this.sortCountAsc = false;

        timeButton.textContent = `按时间排序 ${this.sortTimeAsc ? '▲' : '▼'}`;
        countButton.textContent = `按活动数排序 ${this.sortCountAsc ? '▲' : '▼'}`;

        timeButton.addEventListener('click', () => {
            this.sortTimeAsc = !this.sortTimeAsc;
            timeButton.textContent = `按时间排序 ${this.sortTimeAsc ? '▲' : '▼'}`;
            this.sortActivities('time', this.sortTimeAsc);
        });

        countButton.addEventListener('click', () => {
            this.sortCountAsc = !this.sortCountAsc;
            countButton.textContent = `按活动数排序 ${this.sortCountAsc ? '▲' : '▼'}`;
            this.sortActivities('count', this.sortCountAsc);
        });
    },

    setupEventListeners: function() {
        // Export and sync to flomo functionality
        document.getElementById('syncToFlomo').addEventListener('click', (event) => {
            event.preventDefault();
            this.syncToFlomo();
        });
    },

    syncToFlomo: async function() {
        try {
            // Get the currently filtered activities
            const { startDate, endDate } = this.getDateRange();
            const filterType = this.filterType.value;
            
            // Filter activities based on current filters
            const filteredActivities = this.activities.filter(activity => {
                const activityDate = new Date(activity.timestamp);
                const matchesDate = activityDate >= startDate && activityDate <= endDate;
                const matchesType = filterType === 'all' ? activity.activityType !== 'add_item' : activity.activityType === filterType
                
                // Check tag filters
                const matchesTags = this.activeTagFilters.size === 0 || Array.from(this.activeTagFilters).some(tag => {
                    return activity.annotationTags && activity.annotationTags.includes(tag);
                });
                
                // Check color filters
                const matchesColors = this.activeColorFilters.size === 0 || Array.from(this.activeColorFilters).some(color => {
                    return activity.annotationColor === color;
                });
                
                return matchesDate && matchesType && matchesTags && matchesColors;
            });

            // Group activities by article
            const groupedByArticle = {};
            filteredActivities.forEach(activity => {
                const title = activity.articleTitle || 'Other Activities';
                if (!groupedByArticle[title]) {
                    groupedByArticle[title] = [];
                }
                groupedByArticle[title].push(activity);
            });

            let flomoContent = '';

            // Format content for each article
            for (const [title, activities] of Object.entries(groupedByArticle)) {
                // Add article title as a memo title
                flomoContent += `# 📖 ${title}\n\n`;

                for (const activity of activities) {
                    // Get activity type and determine icon
                    let icon = '📝'; // Default icon for notes
                    if (activity.activityType === 'highlight_annotation') {
                        icon = '💡';
                    } else if (activity.activityType === 'underline_annotation') {
                        icon = '📌';
                    }

                    // Add annotation text or note content
                    if (activity.annotationText) {
                        flomoContent += `${icon} ${activity.annotationText}\n`;
                    } else if (activity.noteText) {
                        // Extract note content from HTML
                        const noteMatch = activity.noteText.match(/<p>(.*?)<\/p>/);
                        if (noteMatch) {
                            flomoContent += `${icon} ${noteMatch[1]}\n`;
                        }
                    }

                    // Add annotation comment if present
                    if (activity.annotationComment) {
                        flomoContent += `💭 ${activity.annotationComment}\n`;
                    }

                    // Add tags if present
                    if (activity.annotationTags) {
                        try {
                            const tags = JSON.parse(activity.annotationTags);
                            if (Array.isArray(tags) && tags.length > 0) {
                                const tagStr = tags.map(tag => {
                                    // Replace spaces with underscores in tag
                                    const formattedTag = tag.tag.replace(/\s+/g, '_');
                                    return `#${formattedTag}`;
                                }).join(' ');
                                flomoContent += `${tagStr}\n`;
                            }
                        } catch (e) {
                            console.error('[ZoTracer] Error parsing annotation tags:', e);
                        }
                    }

                    // Add timestamp
                    flomoContent += `_${new Date(activity.timestamp).toLocaleString()}_\n\n`;
                }

                // Add separator between articles
                flomoContent += '---\n\n';
            }

            // Add source tag at the end
            flomoContent += '#zotero #research';

            // Send to Flomo using Zotero's HTTP client
            const httpClient = Zotero.ZoTracer.HttpClient;
            const response = await httpClient.sendToFlomo(flomoContent);
            alert("✨ 同步成功！\n\n您的阅读笔记已成功保存到 Flomo 📚");
        } catch (error) {
            console.error('[ZoTracer] Error syncing to Flomo:', error);
            if (error.message.includes("PRO membership")) {
                alert("⭐️ 需要升级\n\n此功能需要 Flomo PRO 会员才能使用\n请升级您的 Flomo 账户以使用此功能");
            } else {
                alert("❌ 同步失败\n\n无法保存到 Flomo，请检查：\n1. 网络连接是否正常\n2. Webhook 地址是否正确\n\n详细错误：" + error.message);
            }
        }
    },

    sortActivities: function(sortType, isAscending) {
        const activityList = document.getElementById('activity-list');
        const articleGroups = Array.from(activityList.children);
        
        articleGroups.sort((a, b) => {
            if (sortType === 'time') {
                // 获取最新活动的时间戳进行比较
                const timeA = a.querySelector('.activity-time').getAttribute('data-timestamp');
                const timeB = b.querySelector('.activity-time').getAttribute('data-timestamp');
                return isAscending ? timeA.localeCompare(timeB) : timeB.localeCompare(timeA);
            } else {
                // 获取每个文章组的活动数量（从stats文本中提取）
                const countA = parseInt(a.querySelector('.article-stats').textContent.match(/(\d+) activities/)[1]);
                const countB = parseInt(b.querySelector('.article-stats').textContent.match(/(\d+) activities/)[1]);
                return isAscending ? countA - countB : countB - countA;
            }
        });

        // Clear and re-append sorted groups
        activityList.innerHTML = '';
        articleGroups.forEach(group => activityList.appendChild(group));
    },

    getColorForLevel: function(level) {
        const colors = {
            0: '#ebedf0',
            1: '#9be9a8',
            2: '#40c463',
            3: '#30a14e',
            4: '#216e39'
        };
        return colors[level] || colors[0];
    },

    formatActivityDescription: function(activity) {
        const actionMap = {
            'highlight_annotation': 'Highlighted text',
            'modify_annotation': 'Modified annotation',
            'add_note': 'Added note',
            'modify_item': 'Modified item',
            'select_tab': 'Selected tab',
            'trash_item': 'Moved to trash',
            'open_file': 'Opened file',
            'close_tab': 'Closed tab',
            'add_tab': 'Added tab',
            'add_item': 'Added item',
            'index_item': 'Indexed item',
            'refresh_item': 'Refreshed item',
            'delete_item': 'Deleted item',
            'underline_annotation': 'Underlined text'
        };

        let description = '<div class="activity-content">';
        
        // Add action type with icon
        const actionIcon = activity.activityType.includes('annotation') ? '✍️' : 
                         activity.activityType.includes('note') ? '📝' : 
                         activity.activityType.includes('item') ? '📄' : '🔍';
        description += `<div class="activity-header">
            <span class="activity-action">${actionIcon} ${actionMap[activity.activityType] || activity.activityType}</span>`;
        
        // Add color dot if available
        if (activity.annotationColor) {
            description += `<span class="color-dot" style="background-color: ${activity.annotationColor}"></span>`;
        }
        description += '</div>';
        
        // Add annotation details for annotation types
        if (activity.activityType.includes('annotation')) {
            description += '<div class="activity-details">';
            if (activity.annotationText) {
                description += `<div class="annotation-text">
                    <span class="quote-mark">"</span>${activity.annotationText.substring(0, 50)}${activity.annotationText.length > 50 ? '...' : ''}<span class="quote-mark">"</span>
                </div>`;
            }
            if (activity.annotationComment) {
                description += `<div class="annotation-comment">
                    <span class="comment-icon">💭</span> ${activity.annotationComment}
                </div>`;
            }
            description += '</div>';
        }

        // Add note text if available
        if (activity.activityType === 'add_note' && activity.noteText) {
            try {
                const noteContent = activity.noteText.match(/<p>(.*?)<\/p>/);
                if (noteContent && noteContent[1]) {
                    description += `<div class="activity-details">
                        <div class="note-text">
                            <span class="quote-mark">"</span>${noteContent[1].substring(0, 50)}${noteContent[1].length > 50 ? '...' : ''}<span class="quote-mark">"</span>
                        </div>
                    </div>`;
                }
            } catch (e) {
                console.error("[ZoTracer] Error parsing note text:", e);
            }
        }

        // Add tags if present
        if (activity.annotationTags) {
            try {
                const tags = JSON.parse(activity.annotationTags);
                if (Array.isArray(tags) && tags.length > 0) {
                    description += '<div class="tags-container">';
                    const tagStr = tags.map(tag => {
                        return `<span class="activity-tag" data-tag="${tag.tag}">
                            <span class="tag-icon">#</span>${tag.tag}
                        </span>`;
                    }).join('');
                    description += tagStr + '</div>';
                }
            } catch (e) {
                console.log('[ZoTracer] Error parsing annotation tags:', e);
            }
        }

        description += '</div>';
        return description;
    },

    groupActivitiesByDate: function(activities) {
        const groups = {};
        activities.forEach(activity => {
            const date = new Date(activity.timestamp).toISOString().split('T')[0];
            if (!groups[date]) {
                groups[date] = [];
            }
            groups[date].push(activity);
        });
        return groups;
    },

    createActivityMap: function(activities) {
        const activityMap = {};
        activities.forEach(activity => {
            const date = new Date(activity.timestamp).toISOString().split('T')[0];
            activityMap[date] = (activityMap[date] || 0) + 1;
        });
        return activityMap;
    },

    getActivityLevel: function(count, maxCount) {
        if (count === 0) return 0;
        if (count <= maxCount * 0.25) return 1;
        if (count <= maxCount * 0.5) return 2;
        if (count <= maxCount * 0.75) return 3;
        return 4;
    },

    formatDate: function(date) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = months[date.getMonth()];
        const day = date.getDate();
        const year = date.getFullYear();
        return `${month} ${day}, ${year}`;
    },

    isSameDay: function(date1, date2) {
        return date1.getFullYear() === date2.getFullYear() &&
               date1.getMonth() === date2.getMonth() &&
               date1.getDate() === date2.getDate();
    },

    updateFilterOptions: function(activities) {
        // Extract unique tags and colors from activities
        const tagFrequency = new Map(); // Map to store tag frequencies
        const colors = new Set();

        activities.forEach(activity => {
            // Extract color from annotation
            if (activity.annotationColor) {
                colors.add(activity.annotationColor);
            }

            // Extract tags from annotationTags
            if (activity.annotationTags) {
                try {
                    const tags = JSON.parse(activity.annotationTags);
                    tags.forEach(tagObj => {
                        if (tagObj.tag) {
                            tagFrequency.set(tagObj.tag, (tagFrequency.get(tagObj.tag) || 0) + 1);
                        }
                    });
                } catch (e) {
                    console.error("[ZoTracer] Error parsing annotationTags:", e);
                }
            }
        });

        // Get top 10 most frequent tags
        const topTags = Array.from(tagFrequency.entries())
            .sort((a, b) => b[1] - a[1]) // Sort by frequency in descending order
            .slice(0, 10) // Take only top 10
            .map(entry => entry[0]); // Get just the tags

        // Update color filters
        this.colorFilters.innerHTML = '';
        colors.forEach(color => {
            const button = document.createElement('button');
            button.className = 'color-filter';
            button.dataset.color = color;
            button.style.backgroundColor = color;
            button.title = color;
            
            // Add click event listener
            button.addEventListener('click', () => {
                button.classList.toggle('active');
                if (this.activeColorFilters.has(color)) {
                    this.activeColorFilters.delete(color);
                    this.removeActiveFilter(color);
                } else {
                    this.activeColorFilters.add(color);
                    this.addActiveFilter(color, true);
                }
                this.updateActivityLog();
            });
            
            this.colorFilters.appendChild(button);
        });

        // Update tag filters with top 10 tags
        this.tagFilters.innerHTML = '';
        topTags.forEach(tag => {
            const button = document.createElement('button');
            button.className = 'tag-filter';
            button.dataset.tag = tag;
            button.textContent = `${tag} (${tagFrequency.get(tag)})`;  // Show frequency count
            
            // Add click event listener
            button.addEventListener('click', () => {
                button.classList.toggle('active');
                if (this.activeTagFilters.has(tag)) {
                    this.activeTagFilters.delete(tag);
                    this.removeActiveFilter(tag);
                } else {
                    this.activeTagFilters.add(tag);
                    this.addActiveFilter(tag);
                }
                this.updateActivityLog();
            });
            
            this.tagFilters.appendChild(button);
        });
    },

    updateCollectionsChart: async function(activities) {
        const collectionStats = new Map();
        
        // Count activities per collection
        activities.forEach(activity => {
            if (activity.collectionIds) {
                let collections;
                try {
                    collections = JSON.parse(activity.collectionIds);
                    collections.forEach(collectionId => {
                        collectionStats.set(collectionId, (collectionStats.get(collectionId) || 0) + 1);
                    });
                } catch (e) {
                    console.error("[ZoTracer] Error parsing collection IDs:", e);
                }
            }
        });

        // Sort collections by activity count and get top 4
        const topCollections = Array.from(collectionStats.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4);

        // Get collection names
        const collectionsWithNames = await Promise.all(
            topCollections.map(async ([id]) => {
                try {
                    const collection = await Zotero.Collections.get(id);
                    return {
                        id,
                        name: collection ? collection.name : `Collection ${id}`,
                        count: collectionStats.get(id)
                    };
                } catch (e) {
                    console.error("[ZoTracer] Error getting collection name:", e);
                    return {
                        id,
                        name: `Collection ${id}`,
                        count: collectionStats.get(id)
                    };
                }
            })
        );

        // Create bar chart
        const ctx = document.getElementById('collectionsChart');
        if (this.collectionsChart) {
            this.collectionsChart.destroy();
        }

        const chartData = {
            labels: collectionsWithNames.map(c => c.name),
            datasets: [{
                data: collectionsWithNames.map(c => c.count),
                backgroundColor: '#9be9a8',
                borderColor: '#40c463',
                borderWidth: 1,
                borderRadius: 4
            }]
        };

        this.collectionsChart = new Chart(ctx, {
            type: 'bar',
            data: chartData,
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                events: [], // Disable all events
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        enabled: false
                    }
                },
                scales: {
                    x: {
                        display: false,
                        grid: {
                            display: false
                        }
                    },
                    y: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            padding: 2,
                            font: {
                                size: 10
                            },
                            callback: function(value) {
                                const label = this.getLabelForValue(value);
                                return label.length > 15 ? label.substring(0, 12) + '...' : label;
                            }
                        }
                    }
                },
                layout: {
                    padding: {
                        left: 2,
                        right: 20,
                        top: 0,
                        bottom: 0
                    }
                },
                barThickness: 7,
                maxBarThickness: 5,
                barPercentage: 0.5,
                categoryPercentage: 0.7
            },
            plugins: [{
                afterDraw: function(chart) {
                    var ctx = chart.ctx;
                    chart.data.datasets.forEach(function(dataset, i) {
                        var meta = chart.getDatasetMeta(i);
                        meta.data.forEach(function(bar, index) {
                            var data = dataset.data[index];
                            ctx.fillStyle = '#586069';
                            ctx.font = '10px system-ui';
                            ctx.textAlign = 'left';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(data, bar.x + 4, bar.y);
                        });
                    });
                }
            }]
        });
    },

    updateActivityRadarChart: function(activities) {
        // Count different types of activities
        const activityTypes = {
            'highlight_annotation': 0,
            'underline_annotation': 0,
            'add_note': 0,
            'add_item': 0
        };

        activities.forEach(activity => {
            if (activityTypes.hasOwnProperty(activity.activityType)) {
                activityTypes[activity.activityType]++;
            }
        });

        // Prepare chart data
        const ctx = document.getElementById('activityRadarChart');
        if (this.activityRadarChart) {
            this.activityRadarChart.destroy();
        }

        const labels = [
            'Highlight Annotation',
            'Underline Annotation',
            'Add Notes',
            'Add Items'
        ];
        const data = [
            activityTypes['highlight_annotation'],
            activityTypes['underline_annotation'],
            activityTypes['add_note'],
            activityTypes['add_item']
        ];

        this.activityRadarChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: '#9be9a8',
                    borderColor: '#40c463',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                events: [], // Disable all events
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        enabled: false
                    }
                },
                scales: {
                    x: {
                        display: false,
                        grid: {
                            display: false
                        }
                    },
                    y: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            padding: 2,
                            font: {
                                size: 10
                            }
                        }
                    }
                },
                layout: {
                    padding: {
                        left: 2,
                        right: 20,
                        top: 0,
                        bottom: 0
                    }
                },
                barThickness: 7,
                maxBarThickness: 5,
                barPercentage: 0.5,
                categoryPercentage: 0.7
            },
            plugins: [{
                afterDraw: function(chart) {
                    var ctx = chart.ctx;
                    chart.data.datasets.forEach(function(dataset, i) {
                        var meta = chart.getDatasetMeta(i);
                        meta.data.forEach(function(bar, index) {
                            var data = dataset.data[index];
                            ctx.fillStyle = '#586069';
                            ctx.font = '10px system-ui';
                            ctx.textAlign = 'left';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(data, bar.x + 4, bar.y);
                        });
                    });
                }
            }]
        });
    },
    setupCollapse() {
        const overviewSection = document.querySelector('.activity-overview');
        const collapseButton = document.querySelector('.collapse-button');
        
        // Restore collapsed state from preferences
        const isCollapsed = Zotero.Prefs.get('zotracer.overview.collapsed', true) || false;
        if (isCollapsed) {
            overviewSection.classList.add('collapsed');
        }

        collapseButton.addEventListener('click', () => {
            overviewSection.classList.toggle('collapsed');
            // Store collapsed state in preferences
            Zotero.Prefs.set(
                'zotracer.overview.collapsed',
                overviewSection.classList.contains('collapsed'),
                true
            );
        });
    },
    getActivityCount(activity) {
        // Count annotations, notes, and other activities separately
        const annotationCount = activity.annotationText ? 1 : 0;
        const noteCount = activity.noteText ? 1 : 0;
        const otherCount = activity.activityType !== 'highlight_annotation' && activity.activityType !== 'underline_annotation' && activity.activityType !== 'add_note' ? 1 : 0;
        return annotationCount + noteCount + otherCount;
    },
};

// Initialize when window loads
window.addEventListener('load', () => {
    try {
        ZoTracerActivityLog.init();
        ZoTracerActivityLog.setupCollapse();
    } catch (error) {
        console.error("[ZoTracer] Error during initialization:", error);
    }
});
