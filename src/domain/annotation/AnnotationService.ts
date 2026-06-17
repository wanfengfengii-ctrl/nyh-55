import type {
  Annotation,
  AnnotationTarget,
} from '@/types';
import type { IAnnotatable, ISnapshot } from '../core/types';
import { globalEventBus } from '../core/EventBus';
import { generateId, randomColor } from '@/collaboration/utils';

interface AnnotationServiceSnapshot {
  annotations: Annotation[];
  selectedAnnotationId: string | null;
  showResolved: boolean;
  filterStepNumber: number | null;
}

type AnnotationChangeHandler = (annotations: Annotation[]) => void;

export class AnnotationService
  implements IAnnotatable, ISnapshot<AnnotationServiceSnapshot>
{
  private _annotations: Annotation[] = [];
  private _selectedAnnotationId: string | null = null;
  private _showResolved: boolean = true;
  private _filterStepNumber: number | null = null;
  private _localUserId: string = '';
  private _localUserName: string = '';
  private _sessionId: string | null = null;
  private _handlers: Set<AnnotationChangeHandler> = new Set();

  constructor() {}

  setUserContext(userId: string, userName: string): void {
    this._localUserId = userId;
    this._localUserName = userName;
  }

  setSessionContext(sessionId: string | null): void {
    this._sessionId = sessionId;
  }

  get annotations(): Annotation[] {
    return JSON.parse(JSON.stringify(this._annotations));
  }

  get selectedAnnotationId(): string | null {
    return this._selectedAnnotationId;
  }

  get showResolved(): boolean {
    return this._showResolved;
  }

  get filterStepNumber(): number | null {
    return this._filterStepNumber;
  }

  onChange(handler: AnnotationChangeHandler): () => void {
    this._handlers.add(handler);
    return () => this._handlers.delete(handler);
  }

  private _notify(): void {
    const snapshot = this.annotations;
    this._handlers.forEach((h) => {
      try {
        h(snapshot);
      } catch (e) {
        console.error('[AnnotationService] Handler error:', e);
      }
    });
  }

  addAnnotation(
    target: AnnotationTarget,
    content: string,
    stepNumber: number
  ): Annotation | null {
    if (!content.trim()) return null;

    const annotation: Annotation = {
      id: generateId('ann'),
      sessionId: this._sessionId || 'local',
      authorId: this._localUserId,
      authorName: this._localUserName,
      target,
      content: content.trim(),
      stepNumber,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      resolved: false,
      color: randomColor(),
    };

    this._annotations = [...this._annotations, annotation];

    globalEventBus.publish({
      type: 'annotation.added',
      source: 'annotation',
      payload: { annotation },
    });

    this._notify();
    return annotation;
  }

  updateAnnotation(id: string, updates: Partial<Annotation>): void {
    this._annotations = this._annotations.map((a) => {
      if (a.id !== id) return a;
      if (a.authorId !== this._localUserId) return a;
      const updated = { ...a, ...updates, updatedAt: Date.now() };

      globalEventBus.publish({
        type: 'annotation.updated',
        source: 'annotation',
        payload: { annotation: updated },
      });

      return updated;
    });
    this._notify();
  }

  resolveAnnotation(id: string, resolved: boolean): void {
    this._annotations = this._annotations.map((a) => {
      if (a.id !== id) return a;
      const updated = { ...a, resolved, updatedAt: Date.now() };

      globalEventBus.publish({
        type: 'annotation.resolved',
        source: 'annotation',
        payload: { annotation: updated },
      });

      return updated;
    });
    this._notify();
  }

  removeAnnotation(id: string): void {
    this._annotations = this._annotations.filter((a) => {
      if (a.id !== id) return true;
      return a.authorId !== this._localUserId;
    });
    if (this._selectedAnnotationId === id) {
      this._selectedAnnotationId = null;
    }
    this._notify();
  }

  selectAnnotation(id: string | null): void {
    this._selectedAnnotationId = id;
  }

  setShowResolved(show: boolean): void {
    this._showResolved = show;
  }

  setFilterStepNumber(step: number | null): void {
    this._filterStepNumber = step;
  }

  getAnnotationsForStep(stepNumber: number): Annotation[] {
    const targetStep = this._filterStepNumber ?? stepNumber;
    return this._annotations.filter(
      (a) =>
        a.stepNumber === targetStep &&
        (this._showResolved ? true : !a.resolved)
    );
  }

  getAnnotationsForTarget(target: AnnotationTarget): Annotation[] {
    return this._annotations.filter((a) => {
      if (!this._showResolved && a.resolved) return false;
      const t = a.target;
      if (t.type !== target.type) return false;
      if (t.columnIndex !== target.columnIndex) return false;
      if (t.type === 'wheel' && t.wheelIndex !== target.wheelIndex) return false;
      if (t.type === 'lever' && t.leverIndex !== target.leverIndex) return false;
      return true;
    });
  }

  applyRemoteAnnotation(annotation: Annotation): void {
    const existing = this._annotations.find((a) => a.id === annotation.id);
    if (!existing) {
      this._annotations = [...this._annotations, annotation];
    } else {
      this._annotations = this._annotations.map((a) =>
        a.id === annotation.id ? annotation : a
      );
    }
    this._notify();
  }

  clearAll(): void {
    this._annotations = [];
    this._selectedAnnotationId = null;
    this._notify();
  }

  exportAnnotations(): Annotation[] {
    return JSON.parse(JSON.stringify(this._annotations));
  }

  importAnnotations(list: Annotation[]): void {
    this._annotations = list.map((a) => ({ ...a, id: generateId('ann') }));
    this._notify();
  }

  takeSnapshot(): AnnotationServiceSnapshot {
    return {
      annotations: JSON.parse(JSON.stringify(this._annotations)),
      selectedAnnotationId: this._selectedAnnotationId,
      showResolved: this._showResolved,
      filterStepNumber: this._filterStepNumber,
    };
  }

  restoreSnapshot(snapshot: AnnotationServiceSnapshot): void {
    if (!this.canRestoreFrom(snapshot)) return;
    this._annotations = JSON.parse(JSON.stringify(snapshot.annotations));
    this._selectedAnnotationId = snapshot.selectedAnnotationId;
    this._showResolved = snapshot.showResolved;
    this._filterStepNumber = snapshot.filterStepNumber;
    this._notify();
  }

  canRestoreFrom(snapshot: AnnotationServiceSnapshot): boolean {
    return (
      snapshot && typeof snapshot === 'object' && 'annotations' in snapshot
    );
  }
}

export const annotationService = new AnnotationService();
