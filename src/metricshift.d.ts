// ABOUT: Type definitions for MetricShift feedback widget custom element
// ABOUT: Allows TypeScript to recognize <metricshift-feedback> component

import 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'metricshift-feedback': {
        'project-id'?: string;
        'api-key'?: string;
        mode?: string;
        position?: string;
        variant?: string;
        'button-text'?: string;
        'trigger-layout'?: string;
        'accent-color'?: string;
        'welcome-title'?: string;
        'success-message'?: string;
        'widget-type'?: string;
        'show-branding'?: string;
        'trigger-type'?: string;
      };
    }
  }
}
