import React, { useMemo, useState } from 'react';
import {
  Text,
  Pressable,
  StyleSheet,
  View,
  TextStyle,
  StyleProp,
  Modal,
  ScrollView,
  Dimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

// ── Citation Utilities ──────────────────────────────────────────────

function formatCitationSeconds(seconds?: number | null): string {
  const value = Number(seconds);
  if (!Number.isFinite(value)) return '';
  const totalSeconds = Math.max(0, Math.floor(value));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

function compactCitationLabel(value = '', fallback = '근거 자료', maxLength = 34): string {
  const label = String(value || '').replace(/\s+/g, ' ').trim();
  if (!label) return fallback;
  return label.length > maxLength ? `${label.slice(0, maxLength).trim()}...` : label;
}

export type NormalizedCitation = {
  id: string;
  number: number;
  type: 'material' | 'transcript';
  icon: 'picture-as-pdf' | 'graphic-eq';
  title: string;
  sourceCaption: string;
  locationLabel: string;
  label: string;
  excerpt: string;
  fullText: string;
  raw: Record<string, unknown>;
};

function citationKey(cite: Record<string, unknown> = {}, index = 0): string {
  return String(
    cite?.citation
    || cite?.material_id
    || cite?.transcript_id
    || cite?.recording_id
    || cite?.stored_name
    || cite?.text
    || index
  );
}

export function normalizeCitation(cite: Record<string, unknown> = {}, index = 0): NormalizedCitation {
  const isMaterial = cite?.source_type === 'material';
  const start = formatCitationSeconds(cite?.start_time as number);
  const end = formatCitationSeconds(cite?.end_time as number);
  const page = Number(cite?.page || 0);
  const title = isMaterial
    ? String(cite?.material_name || cite?.file_title || cite?.stored_name || `PDF ${index + 1}`)
    : String(cite?.recording_title || cite?.session_title || cite?.file_title || `전사 ${index + 1}`);
  const locationLabel = isMaterial
    ? (page > 0 ? `p.${page}` : 'PDF 원문')
    : (start && end ? `${start}~${end}` : '전사 원문');
  const fullText = String(cite?.full_transcript || cite?.text || '');
  const excerpt = String(cite?.text || '').trim();

  return {
    id: citationKey(cite, index),
    number: index + 1,
    type: isMaterial ? 'material' : 'transcript',
    icon: isMaterial ? 'picture-as-pdf' : 'graphic-eq',
    title,
    sourceCaption: isMaterial ? 'PDF 자료' : '오디오 전사',
    locationLabel,
    label: compactCitationLabel(
      `${title} ${locationLabel}`,
      `근거 ${index + 1}`
    ),
    excerpt,
    fullText,
    raw: cite,
  };
}

export function normalizeCitations(citations: Record<string, unknown>[] = []): NormalizedCitation[] {
  const seen = new Set<string>();
  const normalized: NormalizedCitation[] = [];

  citations.forEach((cite, index) => {
    const key = citationKey(cite, index);
    if (!key || seen.has(key)) return;
    seen.add(key);
    normalized.push(normalizeCitation(cite, normalized.length));
  });

  return normalized;
}

// ── Highlight Utilities ─────────────────────────────────────────────

function findHighlightRanges(source: string, target: string): Array<{ start: number; end: number; isHighlighted: boolean }> {
  if (!target || !source) return [{ start: 0, end: source.length, isHighlighted: false }];

  const directIndex = source.indexOf(target);
  if (directIndex >= 0) {
    const parts: Array<{ start: number; end: number; isHighlighted: boolean }> = [];
    if (directIndex > 0) parts.push({ start: 0, end: directIndex, isHighlighted: false });
    parts.push({ start: directIndex, end: directIndex + target.length, isHighlighted: true });
    if (directIndex + target.length < source.length) {
      parts.push({ start: directIndex + target.length, end: source.length, isHighlighted: false });
    }
    return parts;
  }

  return [{ start: 0, end: source.length, isHighlighted: false }];
}

// ── Types ───────────────────────────────────────────────────────────

export type CitationInlineTextProps = {
  text: string;
  citations?: any[];
  enableCitations?: boolean;
  onCitationClick?: (citation: any, event?: any) => void;
  onSourceView?: (citation: NormalizedCitation) => void;
  style?: StyleProp<TextStyle>;
};

// ── Popover Component ───────────────────────────────────────────────

function CitationPopover({
  citation,
  visible,
  position,
  onClose,
  onSourceView,
}: {
  citation: NormalizedCitation | null;
  visible: boolean;
  position: { x: number; y: number } | null;
  onClose: () => void;
  onSourceView?: (citation: NormalizedCitation) => void;
}) {
  if (!citation) return null;

  const highlightParts = useMemo(() => {
    return findHighlightRanges(citation.fullText || citation.excerpt, citation.excerpt);
  }, [citation]);

  const isTranscript = citation.type === 'transcript';
  const iconBgColor = isTranscript ? '#FEF3C7' : '#DBEAFE';
  const iconColor = isTranscript ? '#D97706' : '#2563EB';

  const popoverWidth = Math.min(SCREEN_WIDTH * 0.85, 370);
  const left = position ? Math.max(20, Math.min(position.x - popoverWidth / 2, SCREEN_WIDTH - popoverWidth - 20)) : 20;
  const top = position ? position.y + 24 : 100;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={popStyles.overlay} onPress={onClose}>
        <Pressable 
          style={[
            popStyles.popover,
            { position: 'absolute', top, left: Math.max(20, left) }
          ]} 
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={popStyles.header}>
            <View style={[popStyles.headerIcon, { backgroundColor: iconBgColor }]}>
              <MaterialIcons
                name={citation.icon}
                size={18}
                color={iconColor}
              />
            </View>
            <View style={popStyles.headerTextWrap}>
              <Text style={popStyles.headerTitle} numberOfLines={1}>{citation.title}</Text>
              <Text style={popStyles.headerSubtitle}>
                {citation.sourceCaption} · {citation.locationLabel}
              </Text>
            </View>
            <Pressable onPress={onClose} style={popStyles.closeButton}>
              <MaterialIcons name="close" size={20} color="#64748B" />
            </Pressable>
          </View>

          {/* Content */}
          <ScrollView style={popStyles.body} showsVerticalScrollIndicator={false}>
            <Text style={popStyles.bodyText}>
              {highlightParts.map((part, i) => (
                <Text
                  key={i}
                  style={part.isHighlighted ? popStyles.highlightedText : undefined}
                >
                  {(citation.fullText || citation.excerpt).slice(part.start, part.end)}
                </Text>
              ))}
            </Text>
          </ScrollView>

          {/* Source Card */}
          <View style={popStyles.sourceWrap}>
            <Pressable
              style={popStyles.sourceCard}
              onPress={() => {
                onSourceView?.(citation);
                onClose();
              }}
            >
              <View style={[popStyles.sourceIcon, { backgroundColor: iconBgColor }]}>
                <MaterialIcons
                  name={citation.icon}
                  size={16}
                  color={iconColor}
                />
              </View>
              <View style={popStyles.sourceTextWrap}>
                <Text style={popStyles.sourceCaption}>
                  {citation.sourceCaption} · {citation.locationLabel}
                </Text>
                <Text style={popStyles.sourceViewText}>소스 보기</Text>
              </View>
              <MaterialIcons name="open-in-new" size={16} color="#2563EB" />
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Main Component ──────────────────────────────────────────────────

export default function CitationInlineText({
  text,
  citations = [],
  enableCitations = false,
  onCitationClick,
  onSourceView,
  style,
}: CitationInlineTextProps) {
  const [popoverCitation, setPopoverCitation] = useState<NormalizedCitation | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ x: number; y: number } | null>(null);
  const [popoverVisible, setPopoverVisible] = useState(false);

  const normalizedCitations = useMemo(() => {
    return normalizeCitations(citations);
  }, [citations]);

  const parts = useMemo(() => {
    if (!text) return [];
    const result: { type: 'text' | 'citation'; content: string; id?: number }[] = [];
    if (!enableCitations || normalizedCitations.length === 0) {
      result.push({ type: 'text', content: text });
      return result;
    }

    const regex = /(\[\d+(?:\s*,\s*\d+)*\])/g;
    let lastIndex = 0;

    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        result.push({ type: 'text', content: text.substring(lastIndex, match.index) });
      }

      const numMatch = match[0].match(/\d+/g);
      if (numMatch) {
        numMatch.forEach((num) => {
          const id = parseInt(num, 10);
          result.push({ type: 'citation', content: `[${id}]`, id });
        });
      }
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      result.push({ type: 'text', content: text.substring(lastIndex) });
    }

    return result;
  }, [text, normalizedCitations, enableCitations]);

  const mappedCitationIds = useMemo(() => {
    return parts.filter((p) => p.type === 'citation' && p.id != null).map((p) => p.id!);
  }, [parts]);

  const unmappedCitations = useMemo(() => {
    if (!enableCitations) return [];
    return normalizedCitations.filter((c) => !mappedCitationIds.includes(c.number));
  }, [normalizedCitations, mappedCitationIds, enableCitations]);

  const handleMarkerPress = (citeData: NormalizedCitation, event: any) => {
    if (event?.nativeEvent?.pageY) {
      setPopoverPosition({
        x: event.nativeEvent.pageX,
        y: event.nativeEvent.pageY,
      });
    } else {
      setPopoverPosition(null);
    }
    setPopoverCitation(citeData);
    setPopoverVisible(true);
    onCitationClick?.(citeData.raw);
  };

  return (
    <>
      <Text style={[styles.text, style]}>
        {parts.map((part, index) => {
          if (part.type === 'citation' && part.id != null) {
            const citeData = normalizedCitations.find(
              (c) => c.number === part.id
            );
            if (!citeData) {
              return <Text key={index}>{part.content}</Text>;
            }
            return (
              <Text
                key={index}
                style={styles.markerBadgeText}
                onPress={(e) => handleMarkerPress(citeData, e)}
                suppressHighlighting={true}
              >
                {citeData.number}
              </Text>
            );
          }
          return <Text key={index}>{part.content}</Text>;
        })}
        
        {unmappedCitations.map((citeData, index) => (
          <Text key={`unmapped-${citeData.id}-${index}`}>
            <Text
              style={styles.markerBadgeText}
              onPress={(e) => handleMarkerPress(citeData, e)}
              suppressHighlighting={true}
            >
              {citeData.number}
            </Text>
          </Text>
        ))}
      </Text>

      <CitationPopover
        citation={popoverCitation}
        visible={popoverVisible}
        position={popoverPosition}
        onClose={() => setPopoverVisible(false)}
        onSourceView={onSourceView}
      />
    </>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const styles = StyleSheet.create({
  text: {
    lineHeight: 26,
    fontSize: 15,
  },
  markerWrap: {
  },
  markerBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 4,
    textAlign: 'center',
    lineHeight: 14,
  },
});

const popStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  popover: {
    width: Math.min(SCREEN_WIDTH * 0.85, 370),
    maxHeight: '70%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.16,
    shadowRadius: 64,
    elevation: 24,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 12,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  body: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    maxHeight: 320,
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 24,
    color: '#334155',
  },
  highlightedText: {
    backgroundColor: 'rgba(253, 224, 71, 0.44)',
    fontWeight: '800',
    borderRadius: 4,
  },
  sourceWrap: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  sourceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sourceIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceTextWrap: {
    flex: 1,
  },
  sourceCaption: {
    fontSize: 11,
    color: '#64748B',
  },
  sourceViewText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2563EB',
    marginTop: 1,
  },
});
