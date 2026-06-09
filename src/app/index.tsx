import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter, useFocusEffect } from 'expo-router';
import LottieView from 'lottie-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  DeviceEventEmitter,
} from 'react-native';

import { FontFamily } from '@/constants/fonts';
import { getWorkspaceTree, type WorkspaceFileNode, type WorkspaceFolderNode, type WorkspaceNode } from '@/lib/workspace-api';

type RecentFile = {
  color: string;
  date: string;
  id: string;
  sourceCount: number;
  tag: string;
  title: string;
};

const verticalGridLines = Array.from({ length: 28 }, (_, index) => index + 1);
const horizontalGridLines = Array.from({ length: 18 }, (_, index) => index + 1);

export default function HomeScreen() {
  const [input, setInput] = useState('');
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [isRecentLoading, setIsRecentLoading] = useState(true);
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  const layout = useMemo(() => {
    const railWidth = clamp(width * 0.052, 72, 88);
    const shellGap = clamp(width * 0.014, 16, 24);
    const canvasRadius = clamp(width * 0.024, 28, 42);
    const contentWidth = clamp(width * 0.58, 660, 760);
    const welcomeWidth = clamp(width * 0.42, 500, 760);
    const composerHeight = clamp(height * 0.078, 76, 92);
    const homeTopPadding = clamp(height * 0.06, 44, 76);
    const welcomeBottomGap = clamp(height * 0.04, 28, 42);
    const recentTopGap = clamp(height * 0.045, 28, 42);
    const recentCardHeight = clamp(height * 0.14, 104, 118);

    return {
      railWidth,
      shellGap,
      canvasRadius,
      contentWidth,
      welcomeWidth,
      composerHeight,
      homeTopPadding,
      recentCardHeight,
      recentTopGap,
      welcomeBottomGap,
    };
  }, [height, width]);

  const loadRecentFiles = useCallback(async () => {
    try {
      setIsRecentLoading(true);
      const tree = await getWorkspaceTree();
      setRecentFiles(flattenRecentFiles(tree).slice(0, 3));
    } catch (error) {
      console.warn('Failed to load recent workspace files.', error);
      setRecentFiles([]);
    } finally {
      setIsRecentLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRecentFiles();
    }, [loadRecentFiles])
  );

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('globalRefresh', () => {
      loadRecentFiles();
    });
    
    return () => subscription.remove();
  }, [loadRecentFiles]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={[styles.frame, { gap: layout.shellGap }]}>
        <View style={[styles.railWrap, { width: layout.railWidth }]}>
          <View style={styles.rail}>
            <View style={styles.railTop}>
              <Pressable onPress={() => {
                DeviceEventEmitter.emit('globalRefresh');
                router.push('/');
              }}>
                <Image
                  source={require('@/assets/groupchat/logo.png')}
                  style={[
                    styles.logo,
                    {
                      width: layout.railWidth * 0.64,
                      height: layout.railWidth * 0.64,
                      borderRadius: layout.railWidth * 0.32,
                    },
                  ]}
                />
              </Pressable>

              <View style={styles.railNav}>
                <RailButton name="add" onPress={() => router.push('/workspace')} />
                <RailButton name="folder-open" onPress={() => router.push('/workfolder')} />
                <RailButton name="calendar-today" onPress={() => router.push('/calendar')} />
              </View>
            </View>
          </View>
        </View>

        <View style={[styles.canvas, { borderRadius: layout.canvasRadius }]}>
          <GridOverlay />

          <Pressable style={styles.notificationButton}>
            <MaterialIcons name="notifications-none" size={24} color="#1D1D1F" />
          </Pressable>

          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.scrollContent,
              {
                minHeight: Math.max(height - 8, 640),
                paddingTop: layout.homeTopPadding + 60,
              },
            ]}>
            <View style={[styles.centerContent, { maxWidth: layout.contentWidth }]}>
              <LottieView
                autoPlay
                loop
                resizeMode="contain"
                source={require('@/assets/groupchat/animations/welcome.json')}
                style={[
                  styles.welcomeAnimation,
                  {
                    width: layout.welcomeWidth + 10,
                    height: (layout.welcomeWidth + 10) * 0.36,
                    marginBottom: layout.welcomeBottomGap,
                  },
                ]}
              />

              <View style={[styles.composer, { height: layout.composerHeight }]}>
                <TextInput
                  value={input}
                  onChangeText={setInput}
                  placeholder="무엇이든 물어보세요..."
                  placeholderTextColor="#A7A7B2"
                  style={styles.composerInput}
                />

                <Pressable style={[styles.sendButton, input.trim() && styles.sendButtonActive]}>
                  <MaterialIcons name="arrow-upward" size={23} color="#FFFFFF" />
                </Pressable>
              </View>

              <View style={[styles.recentSection, { marginTop: layout.recentTopGap }]}>
                <Text style={styles.sectionTitle}>최근 연 파일</Text>

                <View style={styles.recentGrid}>
                  {isRecentLoading ? (
                    <View style={[styles.recentStatusCard, { height: layout.recentCardHeight }]}>
                      <ActivityIndicator color="#1D1D1F" />
                      <Text style={styles.recentStatusText}>최근 파일을 불러오는 중...</Text>
                    </View>
                  ) : recentFiles.length > 0 ? (
                    recentFiles.map((file) => (
                      <Pressable
                        key={file.id}
                        onPress={() => router.push(`/workspace?sessionId=${encodeURIComponent(file.id)}`)}
                        style={[styles.fileCard, { height: layout.recentCardHeight }]}>
                        <View style={styles.fileCardTop}>
                          <View style={styles.fileIcon}>
                            <MaterialIcons name={file.tag === '회의' ? 'groups' : 'description'} size={18} color="#202329" />
                          </View>
                          <View style={styles.tag}>
                            <Text style={[styles.tagText, { color: file.color }]}>{file.tag}</Text>
                          </View>
                        </View>

                        <Text numberOfLines={1} style={styles.fileTitle}>
                          {file.title}
                        </Text>
                        <Text style={styles.fileDate}>
                          {file.date || '날짜 없음'} · 소스 {file.sourceCount}개
                        </Text>
                      </Pressable>
                    ))
                  ) : (
                    <View style={[styles.recentStatusCard, { height: layout.recentCardHeight }]}>
                      <Text style={styles.recentStatusText}>최근 파일이 없습니다.</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

function RailButton({
  name,
  onPress,
}: {
  name: keyof typeof MaterialIcons.glyphMap;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.railButton}>
      <MaterialIcons name={name} size={28} color="#FFFFFF" />
    </Pressable>
  );
}

function GridOverlay() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {verticalGridLines.map((line) => (
        <View key={`v-${line}`} style={[styles.gridLineVertical, { left: `${line * 3.6}%` }]} />
      ))}
      {horizontalGridLines.map((line) => (
        <View key={`h-${line}`} style={[styles.gridLineHorizontal, { top: `${line * 5.6}%` }]} />
      ))}
    </View>
  );
}

function flattenRecentFiles(tree: WorkspaceNode[]) {
  const files: RecentFile[] = [];

  const visit = (nodes: WorkspaceNode[] = [], parentFolder?: WorkspaceFolderNode) => {
    nodes.forEach((node) => {
      if (node.type === 'folder') {
        visit(node.children ?? [], node);
        return;
      }

      files.push(toRecentFile(node, parentFolder));
    });
  };

  visit(tree);
  return files.sort((a, b) => b.date.localeCompare(a.date, 'ko-KR'));
}

function toRecentFile(node: WorkspaceFileNode, parentFolder?: WorkspaceFolderNode): RecentFile {
  const tag = node.tag || (node.fileKind === 'meeting' ? '회의' : '수업');
  const sourceCount = (node.attachments?.length ?? 0) + (node.recordings?.length ?? 0);

  return {
    color: node.color || (tag === '회의' ? '#2DD4BF' : '#3B82F6'),
    date: node.date || parentFolder?.date || '',
    id: node.id,
    sourceCount,
    tag,
    title: node.name || '새 파일',
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  frame: {
    flex: 1,
    flexDirection: 'row',
    paddingBottom: 5,
    paddingLeft: 4,
    paddingRight: 20,
    paddingTop: 5,
  },
  railWrap: {
    justifyContent: 'flex-start',
  },
  rail: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 24,
    paddingTop: 28,
  },
  railTop: {
    alignItems: 'center',
  },
  logo: {
    backgroundColor: '#111111',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
  railNav: {
    alignItems: 'center',
    gap: 34,
    marginTop: 38,
  },
  railButton: {
    alignItems: 'center',
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  canvas: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    position: 'relative',
  },
  notificationButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 26,
    height: 52,
    justifyContent: 'center',
    position: 'absolute',
    right: 38,
    shadowColor: '#AEB4C0',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.12,
    shadowRadius: 30,
    top: 34,
    width: 52,
    zIndex: 8,
  },
  gridLineVertical: {
    backgroundColor: '#E9EBF0',
    bottom: 0,
    opacity: 0.72,
    position: 'absolute',
    top: 0,
    width: StyleSheet.hairlineWidth,
  },
  gridLineHorizontal: {
    backgroundColor: '#E9EBF0',
    height: StyleSheet.hairlineWidth,
    left: 0,
    opacity: 0.72,
    position: 'absolute',
    right: 0,
  },
  scrollContent: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingBottom: 36,
    paddingHorizontal: 28,
  },
  centerContent: {
    alignItems: 'center',
    position: 'relative',
    width: '100%',
    zIndex: 2,
  },
  welcomeAnimation: {
    marginBottom: 34,
  },
  composer: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderColor: '#DDDDE5',
    borderRadius: 30,
    borderWidth: 1.2,
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: 30,
    paddingVertical: 0,
    shadowColor: '#6A6E7A',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.13,
    shadowRadius: 42,
    width: '100%',
  },
  composerInput: {
    color: '#252832',
    flex: 1,
    fontFamily: FontFamily.extraBold,
    fontSize: 18,
    fontWeight: 'normal',
    height: 48,
    lineHeight: 24,
    padding: 0,
    textAlignVertical: 'center',
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: '#E1DFDC',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  sendButtonActive: {
    backgroundColor: '#1F78FF',
  },
  recentSection: {
    marginTop: 36,
    width: '100%',
  },
  sectionTitle: {
    color: '#565966',
    fontFamily: FontFamily.extraBold,
    fontSize: 13,
    fontWeight: 'normal',
    letterSpacing: 0,
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  recentGrid: {
    flexDirection: 'row',
    gap: 14,
  },
  recentStatusCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.76)',
    borderColor: 'rgba(221,225,235,0.88)',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    gap: 9,
    justifyContent: 'center',
    padding: 14,
  },
  recentStatusText: {
    color: '#777D89',
    fontFamily: FontFamily.extraBold,
    fontSize: 12,
    fontWeight: 'normal',
  },
  fileCard: {
    backgroundColor: 'rgba(220,227,255,0.84)',
    borderColor: 'rgba(255,255,255,0.72)',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    minWidth: 0,
    padding: 14,
    shadowColor: '#181C23',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.05,
    shadowRadius: 42,
  },
  fileCardTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 0,
  },
  fileIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 12,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  tag: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.64)',
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 18,
    paddingHorizontal: 8,
  },
  tagText: {
    color: '#2672FF',
    fontFamily: FontFamily.black,
    fontSize: 10,
    fontWeight: 'normal',
  },
  fileTitle: {
    color: '#202329',
    fontFamily: FontFamily.extraBold,
    fontSize: 13,
    fontWeight: 'normal',
    lineHeight: 17,
    marginBottom: 4,
    marginTop: 'auto',
  },
  fileDate: {
    color: '#868A94',
    fontFamily: FontFamily.semiBold,
    fontSize: 12,
    fontWeight: 'normal',
    lineHeight: 15,
  },
});
