import { Directive, ElementRef, inject } from '@angular/core'

@Directive({ selector: '[appAutofocus]' })
export class AutofocusDirective {
    constructor() {
        inject(ElementRef<HTMLElement>).nativeElement.focus()
    }
}
