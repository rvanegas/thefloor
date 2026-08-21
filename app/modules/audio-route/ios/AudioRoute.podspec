Pod::Spec.new do |s|
  s.name           = 'AudioRoute'
  s.version        = '1.0.0'
  s.summary        = 'Reads the iOS audio route, which nothing else in this app can'
  s.description    = 'A local Expo module exposing AVAudioSession.currentRoute, its sample rate, and route-change notifications with their reason codes.'
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
