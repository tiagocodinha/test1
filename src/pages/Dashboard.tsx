import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, parseISO, isBefore, startOfDay, addDays, startOfWeek, endOfWeek } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Calendar, List, Grid2X2, CheckCircle2, XCircle, ExternalLink, Loader2, Plus, X, CalendarIcon, Archive, ChevronLeft, ChevronRight } from 'lucide-react';
import Header from '../components/Header';

type ViewMode = 'list' | 'type' | 'calendar' | 'archive';
type ContentItem = {
  id: string;
  title: string;
  caption: string;
  content_type: 'Post' | 'Story' | 'Reel' | 'TikTok';
  media_url: string;
  status: 'Approved' | 'Rejected' | 'Pending';
  schedule_date: string;
  rejection_notes?: string;
  rejected_at?: string;
  assigned_to_profile?: {
    email: string;
    full_name: string;
  };
};

function Dashboard() {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedClient, setSelectedClient] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [rejectionNotes, setRejectionNotes] = useState<string>('');
  const [rejectingItemId, setRejectingItemId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    caption: '',
    content_type: 'Post',
    media_url: '',
    schedule_date: format(new Date(), 'yyyy-MM-dd'),
    assigned_to: '',
  });

  const { profile } = useAuth();
  const isAdmin = profile?.email === 'geral@stagelink.pt';
  const today = startOfDay(new Date());

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const previousMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1));
  };

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('is_admin', false);

      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  const { data: contentItems = [], isLoading: isLoadingContent, refetch } = useQuery({
    queryKey: ['content-items', profile?.id, isAdmin],
    queryFn: async () => {
      if (!profile?.id) return [];
      
      const query = supabase
        .from('content_items')
        .select('*, assigned_to_profile:profiles!content_items_assigned_to_fkey(email, full_name)')
        .order('schedule_date', { ascending: true });

      if (!isAdmin) {
        query.eq('assigned_to', profile.id);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as ContentItem[];
    },
    enabled: !!profile?.id,
  });

  const { currentContent, archivedContent } = contentItems.reduce((acc, item) => {
    const itemDate = startOfDay(parseISO(item.schedule_date));
    if (isBefore(itemDate, today)) {
      acc.archivedContent.push(item);
    } else {
      acc.currentContent.push(item);
    }
    return acc;
  }, { currentContent: [] as ContentItem[], archivedContent: [] as ContentItem[] });

  const filteredItems = contentItems.filter(item => {
    if (viewMode === 'calendar') {
      return true;
    }
    
    if (viewMode === 'archive') {
      return isBefore(startOfDay(parseISO(item.schedule_date)), today);
    }

    if (viewMode === 'list') {
      const isCurrentContent = !isBefore(startOfDay(parseISO(item.schedule_date)), today);
      const isPendingOrRejected = item.status === 'Pending' || item.status === 'Rejected';
      const matchesType = selectedType === 'all' || item.content_type === selectedType;
      const matchesClient = selectedClient === 'all' || item.assigned_to_profile?.email === selectedClient;
      return isCurrentContent && isPendingOrRejected && matchesType && matchesClient;
    }
    
    const isCurrentContent = !isBefore(startOfDay(parseISO(item.schedule_date)), today);
    const matchesType = selectedType === 'all' || item.content_type === selectedType;
    const matchesStatus = selectedStatus === 'all' || item.status === selectedStatus;
    const matchesClient = selectedClient === 'all' || item.assigned_to_profile?.email === selectedClient;
    return isCurrentContent && matchesType && matchesStatus && matchesClient;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.assigned_to) {
      alert('Please select a user to assign the content to');
      return;
    }

    const { error } = await supabase.from('content_items').insert({
      ...formData,
      created_by: profile?.id,
      status: 'Pending'
    });

    if (!error) {
      setShowForm(false);
      setFormData({
        title: '',
        caption: '',
        content_type: 'Post',
        media_url: '',
        schedule_date: format(new Date(), 'yyyy-MM-dd'),
        assigned_to: '',
      });
      refetch();
    }
  };

  const handleStatusUpdate = async (id: string, status: 'Approved' | 'Rejected') => {
    if (status === 'Rejected') {
      setRejectingItemId(id);
      setRejectionNotes('');
      return;
    }

    const { error } = await supabase
      .from('content_items')
      .update({ status })
      .eq('id', id);

    if (!error) {
      refetch();
    }
  };

  const handleReject = async () => {
    if (!rejectingItemId || !rejectionNotes.trim()) return;

    const { error } = await supabase
      .from('content_items')
      .update({
        status: 'Rejected',
        rejection_notes: rejectionNotes,
        rejected_at: new Date().toISOString()
      })
      .eq('id', rejectingItemId);

    if (!error) {
      setRejectingItemId(null);
      setRejectionNotes('');
      refetch();
    }
  };

  const renderContentItem = (item: ContentItem) => (
    <div key={item.id} className="bg-white p-4 sm:p-6 rounded-lg shadow-md space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="space-y-2">
          <span className="inline-block px-3 py-1 bg-black text-white rounded-full text-sm">
            {item.content_type}
          </span>
          {isAdmin && item.assigned_to_profile && (
            <div className="text-sm text-gray-500">
              Assigned to: {item.assigned_to_profile.full_name || item.assigned_to_profile.email}
            </div>
          )}
        </div>
        {viewMode !== 'archive' && item.status === 'Pending' && (
          <div className="flex sm:space-x-2">
            <button
              onClick={() => handleStatusUpdate(item.id, 'Approved')}
              className="p-2 hover:bg-green-50 rounded-full transition-colors"
            >
              <CheckCircle2 className="w-6 h-6 text-gray-400 hover:text-green-500" />
            </button>
            <button
              onClick={() => handleStatusUpdate(item.id, 'Rejected')}
              className="p-2 hover:bg-red-50 rounded-full transition-colors"
            >
              <XCircle className="w-6 h-6 text-gray-400 hover:text-red-500" />
            </button>
          </div>
        )}
      </div>
      {item.title && (
        <h3 className="text-lg font-medium text-gray-900">{item.title}</h3>
      )}
      <p className="text-gray-700 break-words whitespace-pre-wrap">{item.caption}</p>
      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
        <a
          href={item.media_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center hover:text-black"
        >
          <ExternalLink className="w-4 h-4 mr-1" />
          View Content
        </a>
        <span className="hidden sm:inline">•</span>
        <span>{format(new Date(item.schedule_date), 'MMM d, yyyy')}</span>
      </div>
      <div className="flex flex-col space-y-2">
        <div className={`text-sm font-medium ${
          item.status === 'Approved' ? 'text-green-500' :
          item.status === 'Rejected' ? 'text-red-500' :
          'text-yellow-500'
        }`}>
          {item.status}
        </div>
        {item.status === 'Rejected' && item.rejection_notes && (
          <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-md">
            <strong>Rejection Notes:</strong> {item.rejection_notes}
          </div>
        )}
      </div>
    </div>
  );

  const renderList = () => {
    if (isLoadingContent) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      );
    }

    if (filteredItems.length === 0) {
      return (
        <div className="text-center py-12">
          <p className="text-gray-500">No pending or rejected content items found</p>
        </div>
      );
    }

    return (
      <div className="p-4 space-y-8">
        <div className="grid grid-cols-1 gap-6">
          {filteredItems.map(renderContentItem)}
        </div>
      </div>
    );
  };

  const renderByType = () => {
    if (isLoadingContent) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      );
    }
  
    const types = ['Post', 'Story', 'Reel', 'TikTok'];
    
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 p-4">
        {types.map(type => (
          <div key={type} className="min-w-0 flex flex-col">
            <h3 className="text-xl font-semibold mb-4">{type}s</h3>
            <div className="space-y-4 flex-1">
              {filteredItems
                .filter(item => item.content_type === type)
                .map(item => (
                  <div key={item.id} className="bg-white p-4 rounded-lg shadow-md space-y-3 break-words">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div className="space-y-2 min-w-0">
                        <span className="inline-block px-3 py-1 bg-black text-white rounded-full text-sm">
                          {item.content_type}
                        </span>
                        {isAdmin && item.assigned_to_profile && (
                          <div className="text-sm text-gray-500 truncate">
                            Assigned to: {item.assigned_to_profile.full_name || item.assigned_to_profile.email}
                          </div>
                        )}
                      </div>
                      {viewMode !== 'archive' && item.status === 'Pending' && (
                        <div className="flex shrink-0 gap-1">
                          <button
                            onClick={() => handleStatusUpdate(item.id, 'Approved')}
                            className="p-1.5 hover:bg-green-50 rounded-full transition-colors"
                          >
                            <CheckCircle2 className="w-5 h-5 text-gray-400 hover:text-green-500" />
                          </button>
                          <button
                            onClick={() => handleStatusUpdate(item.id, 'Rejected')}
                            className="p-1.5 hover:bg-red-50 rounded-full transition-colors"
                          >
                            <XCircle className="w-5 h-5 text-gray-400 hover:text-red-500" />
                          </button>
                        </div>
                      )}
                    </div>
                    {item.title && (
                      <h4 className="text-base font-medium text-gray-900">{item.title}</h4>
                    )}
                    <p className="text-gray-700 text-sm whitespace-pre-wrap">{item.caption}</p>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
                      <a
                        href={item.media_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center hover:text-black"
                      >
                        <ExternalLink className="w-4 h-4 mr-1" />
                        View Content
                      </a>
                      <span className="hidden sm:inline">•</span>
                      <span>{format(new Date(item.schedule_date), 'MMM d, yyyy')}</span>
                    </div>
                    <div className="flex flex-col space-y-2">
                      <div className={`text-sm font-medium ${
                        item.status === 'Approved' ? 'text-green-500' :
                        item.status === 'Rejected' ? 'text-red-500' :
                        'text-yellow-500'
                      }`}>
                        {item.status}
                      </div>
                      {item.status === 'Rejected' && item.rejection_notes && (
                        <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded-md">
                          <strong>Rejection Notes:</strong> {item.rejection_notes}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              {filteredItems.filter(item => item.content_type === type).length === 0 && (
                <div className="text-center py-4 text-gray-500 text-sm">
                  No {type.toLowerCase()}s found
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderCalendarDay = (day: Date, dayContent: ContentItem[]) => {
    const isCurrentMonth = isSameMonth(day, currentDate);
    const isCurrentDay = isToday(day);

    return (
      <div
        key={day.toString()}
        className={`relative min-h-[120px] sm:min-h-[200px] ${
          isCurrentMonth ? 'bg-white' : 'bg-gray-50'
        } ${isCurrentDay ? 'ring-2 ring-black ring-inset' : ''}`}
      >
        <div className="sticky top-0 bg-inherit p-2 z-10 border-b">
          <div className="flex justify-between items-center">
            <span
              className={`text-sm font-medium ${
                isCurrentMonth ? 'text-gray-900' : 'text-gray-400'
              }`}
            >
              {format(day, 'd')}
            </span>
            {dayContent.length > 0 && (
              <span className="text-xs font-medium bg-gray-100 px-2 py-0.5 rounded-full">
                {dayContent.length}
              </span>
            )}
          </div>
        </div>
        {dayContent.length > 0 && (
          <div className="p-1 space-y-1 max-h-[calc(100%-2.5rem)] overflow-y-auto">
            {dayContent.map(content => (
              <div
                key={content.id}
                className="bg-white border rounded p-1.5 shadow-sm hover:shadow transition-shadow text-xs"
              >
                <div className="flex items-start gap-1.5">
                  <div className={`w-2 h-2 mt-1 rounded-full flex-shrink-0 ${
                    content.status === 'Approved' ? 'bg-green-500' :
                    content.status === 'Rejected' ? 'bg-red-500' :
                    'bg-yellow-500'
                  }`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-1 mb-1">
                      <span className="px-1.5 py-0.5 bg-gray-100 text-gray-800 rounded-full text-xs">
                        {content.content_type}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                        content.status === 'Approved' ? 'bg-green-100 text-green-800' :
                        content.status === 'Rejected' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {content.status}
                      </span>
                    </div>
                    <div className="font-medium line-clamp-2">
                      {content.title || 'Untitled'}
                    </div>
                    {isAdmin && content.assigned_to_profile && (
                      <div className="text-gray-500 line-clamp-1 mt-0.5">
                        {content.assigned_to_profile.full_name || content.assigned_to_profile.email}
                      </div>
                    )}
                    <a
                      href={content.media_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center text-gray-600 hover:text-black mt-1"
                      onClick={e => e.stopPropagation()}
                    >
                      <ExternalLink className="w-3 h-3 mr-0.5" />
                      <span>View</span>
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderCalendarMobile = () => {
    if (isLoadingContent) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      );
    }

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    return (
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">
            {format(currentDate, 'MMMM yyyy')}
          </h2>
          <div className="flex gap-2">
            <button
              onClick={previousMonth}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={nextMonth}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {days.map(day => {
            const dayContent = filteredItems.filter(item => {
              const itemDate = parseISO(item.schedule_date);
              return format(itemDate, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd');
            });

            if (dayContent.length === 0) return null;

            return (
              <div key={day.toString()} className="bg-white rounded-lg shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold">
                    {format(day, 'EEEE, MMMM d')}
                  </h3>
                  <span className="text-sm font-medium bg-gray-100 px-2 py-0.5 rounded-full">
                    {dayContent.length} items
                  </span>
                </div>
                <div className="space-y-3">
                  {dayContent.map(content => (
                    <div
                      key={content.id}
                      className="border rounded-lg p-3 space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          content.status === 'Approved' ? 'bg-green-100 text-green-800' :
                          content.status === 'Rejected' ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {content.status}
                        </span>
                        <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 rounded-full">
                          {content.content_type}
                        </span>
                      </div>
                      <div className="font-medium">
                        {content.title || 'Untitled'}
                      </div>
                      {isAdmin && content.assigned_to_profile && (
                        <div className="text-sm text-gray-500">
                          {content.assigned_to_profile.full_name || content.assigned_to_profile.email}
                        </div>
                      )}
                      <div className="text-sm text-gray-600 line-clamp-2">
                        {content.caption}
                      </div>
                      <a
                        href={content.media_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-gray-600 hover:text-black text-sm"
                      >
                        <ExternalLink className="w-4 h-4 mr-1" />
                        View Content
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderCalendar = () => {
    if (isLoadingContent) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      );
    }

    // Show list view on mobile
    if (window.innerWidth < 640) {
      return renderCalendarMobile();
    }

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 }); // Start week on Monday
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 }); // End week on Sunday
    const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    return (
      <div className="p-4">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold">
            {format(currentDate, 'MMMM yyyy')}
          </h2>
          <div className="flex gap-2">
            <button
              onClick={previousMonth}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={nextMonth}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
            <div
              key={day}
              className="bg-gray-50 p-4 text-center text-sm font-semibold"
            >
              {day}
            </div>
          ))}

          {calendarDays.map(day => {
            const dayContent = filteredItems.filter(item => {
              const itemDate = parseISO(item.schedule_date);
              return format(itemDate, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd');
            });

            return renderCalendarDay(day, dayContent);
          })}
        </div>
      </div>
    );
  };

  const renderArchive = () => {
    if (isLoadingContent) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      );
    }

    const itemsByYearAndMonth = archivedContent.reduce((acc, item) => {
      const year = format(new Date(item.schedule_date), 'yyyy');
      const month = format(new Date(item.schedule_date), 'MMMM');
      
      if (!acc[year]) acc[year] = {};
      if (!acc[year][month]) acc[year][month] = [];
      
      acc[year][month].push(item);
      return acc;
    }, {} as Record<string, Record<string, ContentItem[]>>);

    if (Object.keys(itemsByYearAndMonth).length === 0) {
      return (
        <div className="text-center py-12">
          <p className="text-gray-500">No archived content</p>
        </div>
      );
    }

    return (
      <div className="space-y-12 p-4">
        {Object.entries(itemsByYearAndMonth)
          .sort(([yearA], [yearB]) => Number(yearB) - Number(yearA))
          .map(([year, months]) => (
            <div key={year} className="space-y-8">
              <h2 className="text-2xl font-bold border-b pb-2">{year}</h2>
              {Object.entries(months).map(([month, items]) => (
                <div key={`${year}-${month}`} className="space-y-4">
                  <h3 className="text-xl font-semibold">{month}</h3>
                  <div className="grid gap-4">
                    {items.map(renderContentItem)}
                  </div>
                </div>
              ))}
            </div>
          ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-6 sm:py-8">
        <Header isAdmin={isAdmin} />

        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0">
            <div className="flex bg-white rounded-lg shadow-sm min-w-max">
              <button
                onClick={() => setViewMode('list')}
                className={`flex items-center px-3 sm:px-4 py-2 rounded-l-lg ${
                  viewMode === 'list' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <List className="w-5 h-5 mr-1 sm:mr-2" />
                <span className="text-sm sm:text-base">List</span>
              </button>
              <button
                onClick={() => setViewMode('type')}
                className={`flex items-center px-3 sm:px-4 py-2 ${
                  viewMode === 'type' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Grid2X2 className="w-5 h-5 mr-1 sm:mr-2" />
                <span className="text-sm sm:text-base">By Type</span>
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`flex items-center px-3 sm:px-4 py-2 ${
                  viewMode === 'calendar' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Calendar className="w-5 h-5 mr-1 sm:mr-2" />
                <span className="text-sm sm:text-base">Calendar</span>
              </button>
              <button
                onClick={() => setViewMode('archive')}
                className={`flex items-center px-3 sm:px-4 py-2 rounded-r-lg ${
                  viewMode === 'archive' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Archive className="w-5 h-5 mr-1 sm:mr-2" />
                <span className="text-sm sm:text-base">Archive</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            {viewMode !== 'archive' && viewMode === 'list' && (
              <>
                <div className="flex flex-col sm:flex-row gap-4">
                  <select
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                    className="px-3 sm:px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-black text-sm sm:text-base"
                  >
                    <option value="all">All Types</option>
                    <option value="Post">Posts</option>
                    <option value="Story">Stories</option>
                    <option value="Reel">Reels</option>
                    <option value="TikTok">TikTok</option>
                  </select>

                  {isAdmin && (
                    <>
                      <select
                        value={selectedClient}
                        onChange={(e) => setSelectedClient(e.target.value)}
                        className="px-3 sm:px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-black text-sm sm:text-base"
                      >
                        <option value="all">All Clients</option>
                        {profiles.map((profile) => (
                          <option key={profile.id} value={profile.email}>
                            {profile.full_name || profile.email}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                </div>
              </>
            )}

            {viewMode !== 'archive' && isAdmin && (
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center justify-center px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-900 text-sm sm:text-base whitespace-nowrap"
              >
                <Plus className="w-5 h-5 mr-2" />
                Add Content
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {viewMode === 'list' && renderList()}
          {viewMode === 'type' && renderByType()}
          {viewMode === 'calendar' && renderCalendar()}
          {viewMode === 'archive' && renderArchive()}
        </div>

        {showForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Add New Content</h2>
                <button
                  onClick={() => setShowForm(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Assign To
                  </label>
                  <select
                    value={formData.assigned_to}
                    onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                    required
                  >
                    <option value="">Select a user</option>
                    {profiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.full_name || profile.email}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                    placeholder="Enter a title for this content"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Caption
                  </label>
                  <textarea
                    value={formData.caption}
                    onChange={(e) => setFormData({ ...formData, caption: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black font-mono"
                    style={{ whiteSpace: 'pre-wrap' }}
                    required
                    rows={4}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Content Type
                    </label>
                    <select
                      value={formData.content_type}
                      onChange={(e) => setFormData({ ...formData, content_type: e.target.value as any })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                    >
                      <option value="Post">Post</option>
                      <option value="Story">Story</option>
                      <option value="Reel">Reel</option>
                      <option value="TikTok">TikTok</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Schedule Date
                    </label>
                    <div className="relative">
                      <input
                        type="date"
                        value={formData.schedule_date}
                        onChange={(e) => setFormData({ ...formData, schedule_date: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                        required
                      />
                      <CalendarIcon className="absolute right-3 top-2.5 w-5 h-5 text-gray-400" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Media URL (Google Drive)
                  </label>
                  <input
                    type="url"
                    value={formData.media_url}
                    onChange={(e) => setFormData({ ...formData, media_url: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                    required
                  />
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="px-4 py-2 text-gray-700 hover:text-gray-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-900"
                  >
                    Create Content
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {rejectingItemId && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Rejection Notes</h2>
                <button
                  onClick={() => setRejectingItemId(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Please provide a reason for rejection
                    <span className="text-red-500 ml-1">*</span>
                  </label>
                  <textarea
                    value={rejectionNotes}
                    onChange={(e) => setRejectionNotes(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-black transition-colors ${
                      rejectionNotes.trim() ? 'border-gray-300' : 'border-red-300'
                    }`}
                    placeholder="Enter your rejection reason here..."
                    rows={4}
                    required
                  />
                  {!rejectionNotes.trim() && (
                    <p className="mt-1 text-sm text-red-500">
                      Rejection notes are required
                    </p>
                  )}
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setRejectingItemId(null)}
                    className="px-4 py-2 text-gray-700 hover:text-gray-900"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReject}
                    disabled={!rejectionNotes.trim()}
                    className={`px-4 py-2 rounded-lg text-white transition-all ${
                      rejectionNotes.trim()
                        ? 'bg-red-600 hover:bg-red-700 cursor-pointer'
                        : 'bg-red-300 cursor-not-allowed'
                    }`}
                  >
                    Reject Content
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;