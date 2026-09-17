Pod::Spec.new do |s|
  s.name           = 'LiveActivity'
  s.version        = '1.0.0'
  s.summary        = 'The lock screen card, and the Mute button on it'
  s.description    = 'A local Expo module that puts a Live Activity up while this device is standing in a channel, and carries its Mute button back to JavaScript. The ActivityKit half lives in the app target — see LockScreenController.swift — because the attributes type has to be shared with the widget extension.'
  s.author         = ''
  s.homepage       = 'https://thefloor.rvanegas.co'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
