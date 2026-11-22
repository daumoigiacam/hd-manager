import {useEffect, useRef} from 'react';
import {createSettingsSaveController} from '../services/settingsSaveController.js';

export function useSettingsSave(scope, onSave) {
  const context = useRef({scope, active: true, onSave});
  context.current = {...context.current, scope, onSave};
  const controller = useRef(null);
  if (!controller.current) controller.current = createSettingsSaveController({
    isCurrent: value => context.current.active && context.current.scope === value
  });
  useEffect(() => {
    context.current.active = true;
    return () => { context.current.active = false; };
  }, [scope]);
  return {
    scope,
    isCurrent: value => context.current.active && context.current.scope === value,
    isBusy: () => controller.current.isBusy(scope),
    save: (patch, baseCompany) => controller.current.save({scope, patch, baseCompany, save: context.current.onSave})
  };
}
