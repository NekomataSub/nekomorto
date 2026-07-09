import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectForm } from "./dashboard-projects-editor-types";
import { buildProjectEditorSnapshot } from "./project-editor-snapshot";

export type ProjectEditorPendingEpisodeFocus = {
  number: number;
  volume?: number;
} | null;

type UseProjectEditorDialogStateParams = {
  anilistIdInput: string;
  formState: ProjectForm;
  initialFormState: ProjectForm;
  isLibraryOpen: boolean;
  onCloseEditor: () => void;
};

export const useProjectEditorDialogState = ({
  anilistIdInput,
  formState,
  initialFormState,
  isLibraryOpen,
  onCloseEditor,
}: UseProjectEditorDialogStateParams) => {
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isEditorDialogScrolled, setIsEditorDialogScrolled] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("Sair da edição?");
  const [confirmDescription, setConfirmDescription] = useState(
    "Você tem alterações não salvas. Deseja continuar?",
  );
  const confirmActionRef = useRef<(() => void) | null>(null);
  const confirmCancelRef = useRef<(() => void) | null>(null);
  const autoEditHandledRef = useRef<string | null>(null);
  const editorInitialSnapshotRef = useRef<string>(buildProjectEditorSnapshot(initialFormState, ""));
  const pendingEpisodeFocusRef = useRef<ProjectEditorPendingEpisodeFocus>(null);

  const isDirty = useMemo(
    () =>
      buildProjectEditorSnapshot(formState, anilistIdInput) !== editorInitialSnapshotRef.current,
    [anilistIdInput, formState],
  );

  const isLibraryOpenRef = useRef(isLibraryOpen);
  const libraryJustClosedRef = useRef(false);
  const requestCloseEditorRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!isLibraryOpen && isLibraryOpenRef.current) {
      libraryJustClosedRef.current = true;
      const timer = setTimeout(() => {
        libraryJustClosedRef.current = false;
      }, 100);
      isLibraryOpenRef.current = false;
      return () => clearTimeout(timer);
    }
    isLibraryOpenRef.current = isLibraryOpen;
  }, [isLibraryOpen]);

  const closeEditor = useCallback(() => {
    pendingEpisodeFocusRef.current = null;
    setIsEditorOpen(false);
    onCloseEditor();
  }, [onCloseEditor]);

  const requestCloseEditor = useCallback(() => {
    if (!isDirty) {
      closeEditor();
      return;
    }

    setConfirmTitle("Sair da edição?");
    setConfirmDescription("Você tem alterações não salvas. Deseja continuar?");
    confirmActionRef.current = () => {
      closeEditor();
    };
    confirmCancelRef.current = () => {
      setConfirmOpen(false);
    };
    setConfirmOpen(true);
  }, [closeEditor, isDirty]);

  useEffect(() => {
    requestCloseEditorRef.current = requestCloseEditor;
  }, [requestCloseEditor]);

  const handleEditorOpenChange = useCallback(
    (next: boolean) => {
      if (!next && (isLibraryOpenRef.current || libraryJustClosedRef.current)) {
        return;
      }
      if (!next) {
        requestCloseEditorRef.current();
        return;
      }
      setIsEditorOpen(true);
    },
    [],
  );

  const markEditorSnapshot = useCallback((nextForm: ProjectForm, nextAniListIdInput: string) => {
    editorInitialSnapshotRef.current = buildProjectEditorSnapshot(nextForm, nextAniListIdInput);
  }, []);

  useEffect(() => {
    if (!isEditorOpen) {
      setIsEditorDialogScrolled(false);
    }
  }, [isEditorOpen]);

  return {
    autoEditHandledRef,
    closeEditor,
    confirmActionRef,
    confirmCancelRef,
    confirmDescription,
    confirmOpen,
    confirmTitle,
    editorInitialSnapshotRef,
    handleEditorOpenChange,
    isDirty,
    isEditorDialogScrolled,
    isEditorOpen,
    markEditorSnapshot,
    pendingEpisodeFocusRef,
    requestCloseEditor,
    setConfirmDescription,
    setConfirmOpen,
    setConfirmTitle,
    setIsEditorDialogScrolled,
    setIsEditorOpen,
  };
};

export default useProjectEditorDialogState;
