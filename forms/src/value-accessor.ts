import {
  AfterViewInit,
  Directive,
  ElementRef,
  HostListener,
  Inject,
  Injector,
  Input,
  OnDestroy,
  Optional,
  Provider,
  Renderer2,
  forwardRef
} from '@angular/core';
import {
  COMPOSITION_BUFFER_MODE,
  DefaultValueAccessor,
  NG_VALUE_ACCESSOR,
  NgControl,
  Validators,
  AbstractControl
} from '@angular/forms';

/**
 * An interface for determining if an element is a checkbox.
 */
export interface CheckedElementLike {
  checked?: boolean;
}

/**
 * An interface for determining if an element is selectable.
 */
export interface SelectableLike {
  selected?: string | number;
  selectedItem?: any;
}

/**
 * An interface for determining if an element is multi selectable.
 */
export interface MultiSelectableLike {
  selectedValues?: Array<string | number>;
  selectedItems?: any[];
}

/**
 * An interface for determining if an element is validatable.
 */
export interface ValidatableLike {
  invalid?: boolean;
  validate?(): void;
}

/**
 * OrigamiControlValueAccessor provider.
 */
export const ORIGAMI_CONTROL_VALUE_ACCESSOR: Provider = {
  provide: NG_VALUE_ACCESSOR,
  useExisting: forwardRef(() => OrigamiControlValueAccessor),
  multi: true
};

/**
 * A value accessor for `ngModel`, `formControl`, and `formControlName`, on
 * custom elements. In addition to one of the above directives, `origami`
 * should be added to the element to denote that this value accessor should
 * control it.
 *
 * Example: `<paper-input [(ngModel)]="value" origami></paper-input>`
 *
 * The connected element should implement one of the below
 * properties:
 *
 * - `checked` as a boolean for checkbox-like elements.
 * - `selected` for single selectable elements. It must be an index or string
 *   name attribute.
 * - `selectedItem` for single selectable elements. It may be any type.
 * - `selectedValues` for multi selectable elements. It must be an array of
 *   indices or string name attributes.
 * - `selectedItems` for multi selectable elements. It must be an array of any
 *   type.
 * - `value` for any basic form element. It may be any type.
 *
 * For selectable and multi selectable elements, the attribute `useKey` should
 * be specified if the control bindings an index or name value to the element
 * instead of an object.
 *
 * Additionally, an element may implement one or more of the following
 * properties:
 *
 * - `disabled` as a boolean
 * - `invalid` as a boolean to indicate validity
 * - `validate()` as a function to run custom validation
 *
 * To listen for changes to these events, an element should implement one or
 * more of the following events to notify Angular of any updates.
 *
 * - `input` - will update any of the above properties
 * - `blur`
 * - `checked-changed`
 * - `selected-changed`
 * - `selected-item-changed`
 * - `selected-values-changed`
 * - `selected-items-changed`
 * - `value-changed`
 * - `invalid-changed`
 */
@Directive({
  selector:
    '[ngModel][origami],[formControlName][origami],[formControl][origami]',
  providers: [ORIGAMI_CONTROL_VALUE_ACCESSOR]
})
export class OrigamiControlValueAccessor extends DefaultValueAccessor
  implements AfterViewInit, OnDestroy {
  /**
   * Overrides the logic to determine what to set an element's `invalid`
   * property to given the provided `AbstractControl`. The default is to set the
   * element as `invalid` whenever the control is both invalid and dirty.
   */
  @Input()
  isInvalid?: (control: AbstractControl) => boolean;
  /**
   * The key to use when reporting that an element's `validate()` function
   * returns false. When this happens, the control's `errors` object will be
   * set with this key and a value of true.
   *
   * The default key is "validate".
   */
  @Input()
  validationErrorsKey = 'validate';

  /**
   * Subscription to the NgControl's statusChanges.
   */
  protected statusSub?: { unsubscribe(): void };
  /**
   * Most custom elements property will emit a `property-changed` event when
   * their value is set. This flag informs the value accessor to ignore the
   * next event while it is in the middle of writing a value.
   */
  private isWritingValue = false;
  /**
   * Indicates whether or not to use the value property or index property for a
   * select or mulit-select element. When undefined, it indicates that the
   * determination of which property to use has not occurred yet.
   */
  private useSelectableValueProp?: boolean;

  constructor(
    public elementRef: ElementRef,
    protected injector: Injector,
    renderer: Renderer2,
    @Optional()
    @Inject(COMPOSITION_BUFFER_MODE)
    compositionMode: boolean
  ) {
    super(renderer, elementRef, compositionMode);
  }

  /**
   * Lifecycle callback that will connect an element's validatable properties
   * (if they are implemented) to the Angular control.
   */
  ngAfterViewInit() {
    const element = this.elementRef.nativeElement;
    if (this.isValidatable(element)) {
      const control = (<NgControl>this.injector.get(NgControl)).control!;
      // Allows Angular validators to update the custom element's validity
      this.statusSub = control.statusChanges!.subscribe(() => {
        if (typeof this.isInvalid === 'function') {
          element.invalid = this.isInvalid(control);
        } else {
          element.invalid = !!control.invalid && !!control.dirty;
        }
      });

      // Allows custom element validate function to update Angular control's
      // validity
      if (typeof element.validate === 'function') {
        control.setValidators(
          Validators.compose([
            control.validator,
            () => {
              if (element.validate!()) {
                return null;
              } else {
                return { [this.validationErrorsKey]: true };
              }
            }
          ])
        );
      }
    }
  }

  /**
   * Lifecycle callback to clean up subscriptions.
   */
  ngOnDestroy() {
    if (this.statusSub) {
      this.statusSub.unsubscribe();
    }
  }

  /**
   * Writes a value to a custom element's correct value property, based on what
   * kind of element the directive controls.
   *
   * @param value the value to write
   */
  writeValue(value: any) {
    this.isWritingValue = true;
    const element = this.elementRef.nativeElement;
    if (this.isMultiSelectable(element) || this.isSelectable(element)) {
      const property = this.getSelectableProperty(element, value);
      if (property) {
        (<any>element)[property] = value;
      }
    } else if (this.isCheckedElement(element)) {
      element.checked = Boolean(value);
    } else {
      super.writeValue(value);
    }

    this.isWritingValue = false;
  }

  /**
   * Listen for custom element events and notify Angular of any changes.
   *
   * @param event the change event
   */
  @HostListener('selected-items-changed', ['$event'])
  @HostListener('selected-item-changed', ['$event'])
  @HostListener('selected-values-changed', ['$event'])
  @HostListener('selected-changed', ['$event'])
  @HostListener('checked-changed', ['$event'])
  @HostListener('value-changed', ['$event'])
  onChangedEvent(event: Event) {
    if (!this.isWritingValue) {
      const element = this.elementRef.nativeElement;
      let changed = false;
      switch (event.type) {
        case 'selected-items-changed':
        case 'selected-item-changed': {
          const property = this.getSelectableProperty(element);
          changed = property === 'selectedItems' || property === 'selectedItem';
          break;
        }
        case 'selected-values-changed':
        case 'selected-changed': {
          const property = this.getSelectableProperty(element);
          changed = property === 'selectedValues' || property === 'selected';
          break;
        }
        default:
          changed = true;
      }

      if (changed) {
        let property: string;
        if (this.isMultiSelectable(element) || this.isSelectable(element)) {
          // property will be defined if we reach this since changed can only
          // be true if the property is defined for selectable elements
          property = this.getSelectableProperty(element)!;
        } else if (this.isCheckedElement(element)) {
          property = 'checked';
        } else {
          property = 'value';
        }

        // Don't use `event.detail.value`, since we cannot assume that all
        // change events will provide that. Additionally, some event details
        // may be splices of an array or object instead of the current value.
        this.onChange(element[property]);
      }
    }
  }

  /**
   * Determines whether or not an element is checkbox-like.
   *
   * @param element the element to check
   */
  isCheckedElement(element: any): element is CheckedElementLike {
    return this.isPropertyDefined(element, 'checked');
  }

  /**
   * Determines whether or not an element is selectable-like.
   *
   * @param element the element to check
   */
  isSelectable(element: any): element is SelectableLike {
    return (
      this.isPropertyDefined(element, 'selected') ||
      this.isPropertyDefined(element, 'selectedItem')
    );
  }

  /**
   * Determines whether or not an element is multi selectable-like.
   *
   * @param element the element to check
   */
  isMultiSelectable(element: any): element is MultiSelectableLike {
    return (
      !!element &&
      element.multi === true &&
      (this.isPropertyDefined(element, 'selectedValues') ||
        this.isPropertyDefined(element, 'selectedValues'))
    );
  }

  /**
   * Determines whether or not an element is validatable-like.
   *
   * @param element the element to check
   */
  isValidatable(element: any): element is ValidatableLike {
    return this.isPropertyDefined(element, 'invalid');
  }

  /**
   * Determines whether or not a property is defined anywhere in the provided
   * element's prototype chain.
   *
   * @param element the element to check
   * @param property the property to check for
   */
  private isPropertyDefined(element: any, property: string): boolean {
    return !!element && property in element;
  }

  /**
   * Retrieves the property name of the selectable or multi-selectable element
   * that should be updated. This method will use defined properties and the
   * value type to determine which property should be used. If it cannot
   * determine which property to use, it will return undefined.
   *
   * @param element the element to get the property for
   * @param value a value for the element's property
   * @returns the property name, or undefined if it cannot be determined
   */
  private getSelectableProperty(element: any, value?: any): string | undefined {
    const isMulti = this.isMultiSelectable(element);
    const valueProp = isMulti ? 'selectedItems' : 'selectedItem';
    const indexProp = isMulti ? 'selectedValues' : 'selected';
    if (typeof this.useSelectableValueProp !== 'boolean') {
      // Determine whether we should be setting the index or value property for
      // a selectable element
      const hasValueProp = valueProp in element;
      const hasIndexProp = indexProp in element;
      if (hasValueProp && !hasIndexProp) {
        this.useSelectableValueProp = true;
      } else if (!hasValueProp && hasIndexProp) {
        this.useSelectableValueProp = false;
      } else if (typeof value !== 'undefined' && value !== null) {
        const previousValue = element[valueProp];
        // When the element has both properties, try to set it to the value
        // property first. If it fails, then use the index property
        try {
          element[valueProp] = value;
        } catch (error) {
          // Could throw if the value is an unexpected type
        }

        // Check to see if the value we set it to is still accurate. If it's
        // not then the element silently rejected the new value.
        this.useSelectableValueProp = element[valueProp] === value;
        element[valueProp] = previousValue;
      } else {
        return undefined;
      }
    }

    return this.useSelectableValueProp ? valueProp : indexProp;
  }
}
